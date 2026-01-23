import { Router } from 'express'
import { query } from '../db/connection.js'
import { requireAuth } from '../middleware/auth.js'
import { stripe, CREDIT_PACKAGES } from '../stripe.js'

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
      await handleSuccessfulPayment(session)
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

export default router
