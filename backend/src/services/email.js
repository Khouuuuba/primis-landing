/**
 * Email Service — Powered by Resend
 * 
 * Sends transactional emails for:
 * - Subscription confirmation
 * - Message pack purchase confirmation
 * - Usage alerts (approaching limit)
 * 
 * Set RESEND_API_KEY in your environment.
 * Set RESEND_FROM_EMAIL (default: noreply@primisprotocol.ai)
 */

import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Primis <noreply@primisprotocol.ai>'
const DASHBOARD_URL = process.env.AI_BUILDER_URL || 'https://primisprotocol.ai/aibuilder'

/**
 * Send subscription confirmation email after initial $30/mo payment
 */
export async function sendSubscriptionConfirmation({ to, agentName, subscriptionId }) {
  if (!resend) {
    console.warn('Resend not configured — skipping subscription confirmation email')
    return null
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `✅ Primis Subscription Active — ${agentName || 'Your AI Agent'}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #f5f5f5; padding: 32px; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #c87832; font-size: 24px; margin: 0;">Primis Protocol</h1>
          </div>
          
          <h2 style="font-size: 20px; margin: 0 0 12px;">Your subscription is active! 🎉</h2>
          
          <p style="color: #aaa; line-height: 1.6; margin: 0 0 20px;">
            Your AI agent <strong style="color: #f5f5f5;">"${agentName || 'My Agent'}"</strong> is now powered by 
            <strong style="color: #c87832;">Claude Opus</strong> — the most powerful AI model available.
          </p>
          
          <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Plan</span>
              <span>Primis Pro — $30/month</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Messages</span>
              <span>200 Claude Opus messages/month</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #888;">Hosting</span>
              <span>24/7 managed on Railway</span>
            </div>
          </div>
          
          <p style="color: #aaa; line-height: 1.6; margin: 0 0 20px;">
            Need more messages? You can buy additional message packs anytime from your dashboard.
          </p>
          
          <div style="text-align: center; margin: 24px 0;">
            <a href="${DASHBOARD_URL}?tab=moltbot" 
               style="display: inline-block; background: linear-gradient(135deg, #c87832, #a66428); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Open Dashboard →
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #2a2a2a; margin: 24px 0;" />
          
          <p style="color: #666; font-size: 12px; line-height: 1.5; margin: 0;">
            To manage or cancel your subscription, visit your dashboard or reply to this email.
            ${subscriptionId ? `Subscription ID: ${subscriptionId}` : ''}
          </p>
        </div>
      `
    })

    if (error) {
      console.error('Failed to send subscription email:', error)
      return null
    }

    console.log(`Subscription confirmation sent to ${to}:`, data?.id)
    return data
  } catch (err) {
    console.error('Email send error:', err)
    return null
  }
}

/**
 * Send message pack purchase confirmation
 */
export async function sendMessagePackConfirmation({ to, messagesCount, amountPaid, newRemaining }) {
  if (!resend) {
    console.warn('Resend not configured — skipping message pack confirmation email')
    return null
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `✅ ${messagesCount} Messages Added — Primis`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #f5f5f5; padding: 32px; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #c87832; font-size: 24px; margin: 0;">Primis Protocol</h1>
          </div>
          
          <h2 style="font-size: 20px; margin: 0 0 12px;">Messages added! 🎉</h2>
          
          <p style="color: #aaa; line-height: 1.6; margin: 0 0 20px;">
            <strong style="color: #f5f5f5;">${messagesCount} Claude Opus messages</strong> have been added 
            to your account for <strong style="color: #c87832;">$${amountPaid}</strong>.
          </p>
          
          <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Messages Added</span>
              <span>+${messagesCount}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Amount</span>
              <span>$${amountPaid}</span>
            </div>
            ${newRemaining !== undefined ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #888;">Available Now</span>
              <span style="color: #4ade80;">${newRemaining} messages</span>
            </div>
            ` : ''}
          </div>
          
          <div style="text-align: center; margin: 24px 0;">
            <a href="${DASHBOARD_URL}?tab=moltbot" 
               style="display: inline-block; background: linear-gradient(135deg, #c87832, #a66428); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Continue Chatting →
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #2a2a2a; margin: 24px 0;" />
          
          <p style="color: #666; font-size: 12px; line-height: 1.5; margin: 0;">
            Bonus messages don't expire until used. You can buy more anytime from your dashboard.
          </p>
        </div>
      `
    })

    if (error) {
      console.error('Failed to send message pack email:', error)
      return null
    }

    console.log(`Message pack confirmation sent to ${to}:`, data?.id)
    return data
  } catch (err) {
    console.error('Email send error:', err)
    return null
  }
}

export default { sendSubscriptionConfirmation, sendMessagePackConfirmation }
