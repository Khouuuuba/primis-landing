import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { Buffer } from 'buffer'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import App from './App.jsx'
import './index.css'

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

// Polyfill Buffer for Solana/Anchor
window.Buffer = Buffer

// Devnet endpoint
const DEVNET_RPC = 'https://api.devnet.solana.com'

function Root() {
  // Configure wallets - Phantom and Solflare for Devnet
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], [])

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
