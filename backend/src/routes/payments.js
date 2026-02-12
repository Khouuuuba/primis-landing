import { Router } from 'express'
import { query } from '../db/connection.js'
import { requireAuth } from '../middleware/auth.js'
import { stripe, CREDIT_PACKAGES, MESSAGE_PACKS } from '../stripe.js'
import { sendSubscriptionConfirmation, sendMessagePackConfirmation } from '../services/email.js'

const router = Router()

/**
 * GET /api/payments/packages
 * Get available credit packages
 */
router.get('/packages', (req, res) => {
  res.json({
    packages: CREDIT_PACKAGES.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price / 100, // Convert cents to dollars
      popular: pkg.popular,
      description: pkg.description
    }))
  })
})

/**
 * POST /api/payments/checkout
 * Create a Stripe checkout session
 */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    const { packageId } = req.body
    const userId = req.user.id
    const userEmail = req.user.email

    // Find the package
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
    if (!pkg) {
      return res.status(400).json({ error: 'Invalid package' })
    }

    // Get or create Stripe customer
    let customerId = req.user.stripe_customer_id
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: userId,
          privyId: req.user.privy_id
        }
      })
      customerId = customer.id
      
      // Save customer ID to database
      await query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, userId]
      )
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pkg.name} - ${pkg.credits} Credits`,
              description: pkg.description,
            },
            unit_amount: pkg.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard?payment=cancelled`,
      metadata: {
        userId: userId,
        packageId: pkg.id,
        credits: pkg.credits.toString()
      }
    })

    res.json({
      sessionId: session.id,
      url: session.url
    })

  } catch (error) {
    console.error('Checkout error:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

/**
 * POST /api/payments/webhook
 * Handle Stripe webhooks (payment success, etc.)
 */
router.post('/webhook', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment service not configured' })
  }

  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event

  try {
    // Verify webhook signature if secret is configured
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret)
    } else {
      // For testing without signature verification
      event = req.body
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.metadata?.type === 'openclaw_subscription') {
        await handleOpenClawSubscription(session)
      } else if (session.metadata?.type === 'message_pack') {
        await handleMessagePackPurchase(session)
      } else {
        await handleSuccessfulPayment(session)
      }
      break
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      if (subscription.metadata?.type === 'openclaw_subscription') {
        await handleOpenClawCancellation(subscription)
      }
      break
    }
    
    case 'payment_intent.succeeded': {
      console.log('Payment intent succeeded:', event.data.object.id)
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  res.json({ received: true })
})

/**
 * Handle OpenClaw subscription activation
 */
async function handleOpenClawSubscription(session) {
  const { userId, aiProvider, channels, instanceName } = session.metadata
  const subscriptionId = session.subscription

  console.log(`OpenClaw subscription activated for user ${userId}`)

  try {
    // Update the most recent pending instance to mark as paid and ready for deploy
    await query(
      `UPDATE moltbot_instances 
       SET subscription_id = $1,
           subscription_status = 'active',
           updated_at = NOW()
       WHERE id = (
         SELECT id FROM moltbot_instances
         WHERE user_id = $2 AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [subscriptionId, userId]
    )

    // Ensure user has a usage quota row (200 messages/month)
    await query(
      `INSERT INTO usage_quotas (user_id, monthly_limit, period_start)
       VALUES ($1, 200, date_trunc('month', NOW()))
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    // Send confirmation email
    const customerEmail = session.customer_details?.email || session.customer_email
    if (customerEmail) {
      await sendSubscriptionConfirmation({
        to: customerEmail,
        agentName: instanceName || 'My Agent',
        subscriptionId
      })
    }

    console.log(`OpenClaw subscription recorded for user ${userId}`)
  } catch (error) {
    console.error('Failed to record OpenClaw subscription:', error)
  }
}

/**
 * Handle OpenClaw subscription cancellation
 */
async function handleOpenClawCancellation(subscription) {
  const { userId } = subscription.metadata
  const subscriptionId = subscription.id

  console.log(`OpenClaw subscription cancelled for user ${userId}`)

  try {
    // Mark the instance as stopped and subscription cancelled
    await query(
      `UPDATE moltbot_instances 
       SET status = 'stopped',
           subscription_status = 'canceled',
           stopped_at = NOW(),
           updated_at = NOW()
       WHERE subscription_id = $1`,
      [subscriptionId]
    )

    // TODO: Stop the Railway service

  } catch (error) {
    console.error('Failed to handle OpenClaw cancellation:', error)
  }
}

/**
 * Handle message pack purchase — add bonus messages to user's quota
 */
async function handleMessagePackPurchase(session) {
  const { userId, packId, messagesCount } = session.metadata
  const messages = parseInt(messagesCount, 10)
  const amountPaid = session.amount_total / 100

  console.log(`Processing message pack for user ${userId}: ${messages} messages ($${amountPaid})`)

  try {
    // Upsert quota row and add bonus messages
    await query(
      `INSERT INTO usage_quotas (user_id, monthly_limit, bonus_messages, updated_at)
       VALUES ($1, 200, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE 
       SET bonus_messages = usage_quotas.bonus_messages + $2,
           updated_at = NOW()`,
      [userId, messages]
    )

    // Record the purchase for audit trail
    await query(
      `INSERT INTO usage_purchases (user_id, messages_count, amount_usd, stripe_session_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, messages, amountPaid, session.id]
    )

    // Get updated remaining count for email
    let newRemaining
    try {
      const remainResult = await query(
        `SELECT get_remaining_messages($1) as remaining`, [userId]
      )
      newRemaining = remainResult.rows[0]?.remaining
    } catch { /* non-fatal */ }

    // Send confirmation email
    const customerEmail = session.customer_details?.email || session.customer_email
    if (customerEmail) {
      await sendMessagePackConfirmation({
        to: customerEmail,
        messagesCount: messages,
        amountPaid,
        newRemaining
      })
    }

    console.log(`Added ${messages} bonus messages to user ${userId}`)
  } catch (error) {
    console.error('Failed to process message pack purchase:', error)
  }
}

/**
 * Handle successful payment - add credits to user account
 */
async function handleSuccessfulPayment(session) {
  const { userId, packageId, credits } = session.metadata
  const creditsAmount = parseInt(credits, 10)
  const amountPaid = session.amount_total / 100 // Convert cents to dollars

  console.log(`Processing payment for user ${userId}: ${creditsAmount} credits ($${amountPaid})`)

  try {
    // Add credits to user's balance
    await query(
      `UPDATE credits 
       SET balance_usd = balance_usd + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, creditsAmount]
    )

    // Record transaction
    await query(
      `INSERT INTO credit_transactions (user_id, type, amount_usd, stripe_payment_id, description)
       VALUES ($1, 'purchase', $2, $3, $4)`,
      [userId, creditsAmount, session.payment_intent, `Purchased ${creditsAmount} credits for $${amountPaid}`]
    )

    // Update protocol stats
    await query(
      `UPDATE protocol_stats 
       SET total_compute_revenue_usd = total_compute_revenue_usd + $1,
           updated_at = NOW()`,
      [amountPaid]
    )

    console.log(`Successfully added ${creditsAmount} credits to user ${userId}`)

  } catch (error) {
    console.error('Failed to process payment:', error)
    throw error
  }
}

/**
 * GET /api/payments/history
 * Get user's payment history
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `SELECT * FROM credit_transactions 
       WHERE user_id = $1 AND type = 'purchase'
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    )

    res.json({
      payments: result.rows.map(p => ({
        id: p.id,
        amountUsd: parseFloat(p.amount_usd),
        stripePaymentId: p.stripe_payment_id,
        description: p.description,
        createdAt: p.created_at
      }))
    })

  } catch (error) {
    console.error('Payment history error:', error)
    res.status(500).json({ error: 'Failed to get payment history' })
  }
})

/**
 * POST /api/payments/verify
 * Verify a checkout session (after redirect back from Stripe)
 * Also adds credits if not already processed (handles case when webhook not configured)
 */
router.post('/verify', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    const { sessionId } = req.body
    const userId = req.user.id

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status === 'paid') {
      // Check if this payment was already processed
      const existingTx = await query(
        `SELECT id FROM credit_transactions WHERE stripe_payment_id = $1`,
        [session.payment_intent]
      )

      if (existingTx.rows.length === 0) {
        // Payment not yet processed - add credits now
        const credits = parseInt(session.metadata?.credits || 0, 10)
        const amountPaid = session.amount_total / 100

        if (credits > 0) {
          // Add credits to user's balance
          await query(
            `UPDATE credits 
             SET balance_usd = balance_usd + $2,
                 updated_at = NOW()
             WHERE user_id = $1`,
            [userId, credits]
          )

          // Record transaction
          await query(
            `INSERT INTO credit_transactions (user_id, type, amount_usd, stripe_payment_id, description)
             VALUES ($1, 'purchase', $2, $3, $4)`,
            [userId, credits, session.payment_intent, `Purchased ${credits} credits for $${amountPaid}`]
          )

          console.log(`Added ${credits} credits to user ${userId} via verify endpoint`)
        }
      }

      // Get updated credit balance
      const creditsResult = await query(
        `SELECT balance_usd FROM credits WHERE user_id = $1`,
        [userId]
      )

      res.json({
        success: true,
        credits: parseFloat(creditsResult.rows[0]?.balance_usd || 0)
      })
    } else {
      res.json({
        success: false,
        status: session.payment_status
      })
    }

  } catch (error) {
    console.error('Payment verification error:', error)
    res.status(500).json({ error: 'Failed to verify payment' })
  }
})

// =============================================================================
// MESSAGE PACKS (Buy More Messages)
// =============================================================================

/**
 * GET /api/payments/message-packs
 * List available message packs for purchase
 */
router.get('/message-packs', (req, res) => {
  res.json({
    packs: MESSAGE_PACKS.map(p => ({
      id: p.id,
      name: p.name,
      messages: p.messages,
      price: p.price / 100,
      popular: p.popular || false,
      description: p.description
    }))
  })
})

/**
 * POST /api/payments/buy-messages
 * Create a Stripe checkout session for a one-time message pack purchase
 */
router.post('/buy-messages', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    const { packId } = req.body
    const userId = req.user.id
    const userEmail = req.user.email

    // Find the pack
    const pack = MESSAGE_PACKS.find(p => p.id === packId)
    if (!pack) {
      return res.status(400).json({ error: 'Invalid message pack' })
    }

    // Get or create Stripe customer
    let customerId = req.user.stripe_customer_id
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { userId, privyId: req.user.privy_id }
      })
      customerId = customer.id
      await query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, userId]
      )
    }

    // Create one-time checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pack.name} — Primis AI Messages`,
              description: `${pack.messages} additional Claude Opus messages`,
            },
            unit_amount: pack.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.AI_BUILDER_URL || 'http://localhost:5173'}?tab=moltbot&messages=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.AI_BUILDER_URL || 'http://localhost:5173'}?tab=moltbot&messages=cancelled`,
      metadata: {
        userId,
        type: 'message_pack',
        packId: pack.id,
        messagesCount: pack.messages.toString()
      }
    })

    res.json({
      sessionId: session.id,
      url: session.url
    })

  } catch (error) {
    console.error('Buy messages checkout error:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// =============================================================================
// OPENCLAW SUBSCRIPTION
// =============================================================================

/**
 * POST /api/payments/verify-messages
 * Verify a message pack purchase (after Stripe redirect) 
 * Also adds bonus messages if not already processed by webhook
 */
router.post('/verify-messages', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    const { sessionId } = req.body
    const userId = req.user.id

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status === 'paid' && session.metadata?.type === 'message_pack') {
      // Check if already processed
      const existing = await query(
        `SELECT id FROM usage_purchases WHERE stripe_session_id = $1`,
        [session.id]
      )

      if (existing.rows.length === 0) {
        // Not yet processed by webhook — do it now
        await handleMessagePackPurchase(session)
      }

      // Return updated usage
      const countResult = await query(
        `SELECT get_remaining_messages($1) as remaining`,
        [userId]
      )

      res.json({
        success: true,
        messagesAdded: parseInt(session.metadata.messagesCount, 10),
        remaining: countResult.rows[0]?.remaining || 0
      })
    } else {
      res.json({ success: false, status: session.payment_status })
    }
  } catch (error) {
    console.error('Message pack verification error:', error)
    res.status(500).json({ error: 'Failed to verify purchase' })
  }
})

/**
 * POST /api/payments/openclaw-checkout
 * Create a Stripe checkout session for OpenClaw subscription ($30/mo)
 */
router.post('/openclaw-checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    const { aiProvider, channels, instanceName } = req.body
    const userId = req.user.id
    const userEmail = req.user.email

    // Get or create Stripe customer
    let customerId = req.user.stripe_customer_id
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: userId,
          privyId: req.user.privy_id
        }
      })
      customerId = customer.id
      
      // Save customer ID to database
      await query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, userId]
      )
    }

    // Get or create the OpenClaw subscription price
    let priceId = process.env.STRIPE_OPENCLAW_PRICE_ID
    
    if (!priceId) {
      // Create product and price if not configured
      const product = await stripe.products.create({
        name: 'OpenClaw Hosting',
        description: 'Personal AI assistant hosting - Telegram, Discord, Slack & more',
        metadata: { type: 'openclaw_subscription' }
      })

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 3000, // $30.00
        currency: 'usd',
        recurring: { interval: 'month' }
      })
      
      priceId = price.id
      console.log(`Created OpenClaw price: ${priceId} - Save this as STRIPE_OPENCLAW_PRICE_ID`)
    }

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.AI_BUILDER_URL || 'http://localhost:5173'}?tab=moltbot&openclaw=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.AI_BUILDER_URL || 'http://localhost:5173'}?tab=moltbot&openclaw=cancelled`,
      metadata: {
        userId: userId,
        type: 'openclaw_subscription',
        aiProvider: aiProvider || 'anthropic',
        channels: JSON.stringify(channels || ['telegram']),
        instanceName: instanceName || 'my-openclaw'
      },
      subscription_data: {
        metadata: {
          userId: userId,
          type: 'openclaw_subscription',
          aiProvider: aiProvider || 'anthropic'
        }
      }
    })

    res.json({
      sessionId: session.id,
      url: session.url
    })

  } catch (error) {
    console.error('OpenClaw checkout error:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

/**
 * GET /api/payments/openclaw-subscription
 * Get user's OpenClaw subscription status
 */
router.get('/openclaw-subscription', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.json({ hasSubscription: false })
    }

    const customerId = req.user.stripe_customer_id
    
    if (!customerId) {
      return res.json({ hasSubscription: false })
    }

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10
    })

    const openclawSub = subscriptions.data.find(
      sub => sub.metadata?.type === 'openclaw_subscription'
    )

    if (openclawSub) {
      res.json({
        hasSubscription: true,
        subscription: {
          id: openclawSub.id,
          status: openclawSub.status,
          currentPeriodEnd: new Date(openclawSub.current_period_end * 1000),
          cancelAtPeriodEnd: openclawSub.cancel_at_period_end
        }
      })
    } else {
      res.json({ hasSubscription: false })
    }

  } catch (error) {
    console.error('Subscription check error:', error)
    res.status(500).json({ error: 'Failed to check subscription' })
  }
})

/**
 * POST /api/payments/openclaw-cancel
 * Cancel OpenClaw subscription (at period end)
 */
router.post('/openclaw-cancel', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    const { subscriptionId } = req.body
    
    // Cancel at period end (user keeps access until billing period ends)
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    })

    res.json({
      success: true,
      cancelAt: new Date(subscription.cancel_at * 1000)
    })

  } catch (error) {
    console.error('Subscription cancel error:', error)
    res.status(500).json({ error: 'Failed to cancel subscription' })
  }
})

export default router
