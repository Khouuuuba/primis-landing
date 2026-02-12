import Stripe from 'stripe'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not set. Payment features disabled.')
}

// Initialize Stripe with your secret key
export const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    })
  : null

// Credit packages available for purchase
export const CREDIT_PACKAGES = [
  {
    id: 'credits_25',
    name: 'Starter Pack',
    credits: 25,
    price: 2500, // in cents ($25.00)
    popular: false,
    description: 'Perfect for testing and small experiments'
  },
  {
    id: 'credits_100',
    name: 'Pro Pack',
    credits: 100,
    price: 9500, // in cents ($95.00) - 5% discount
    popular: true,
    description: 'Best value for regular usage'
  },
  {
    id: 'credits_500',
    name: 'Team Pack',
    credits: 500,
    price: 45000, // in cents ($450.00) - 10% discount
    popular: false,
    description: 'For teams and heavy workloads'
  }
]

// Message packs (one-time purchases to add bonus messages)
export const MESSAGE_PACKS = [
  {
    id: 'messages_50',
    name: '50 Messages',
    messages: 50,
    price: 500, // $5.00
    description: 'Quick top-up'
  },
  {
    id: 'messages_200',
    name: '200 Messages',
    messages: 200,
    price: 1500, // $15.00
    popular: true,
    description: 'Best value — like getting another month'
  },
  {
    id: 'messages_500',
    name: '500 Messages',
    messages: 500,
    price: 3000, // $30.00
    description: 'Power user pack'
  }
]

// Verify Stripe connection
export async function verifyStripeConnection() {
  if (!stripe) return false
  try {
    await stripe.customers.list({ limit: 1 })
    return true
  } catch (error) {
    console.error('Stripe connection error:', error.message)
    return false
  }
}
