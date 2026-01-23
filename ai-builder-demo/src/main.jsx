import React from 'react'
import ReactDOM from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID || "REPLACE_WITH_YOUR_PRIVY_APP_ID"}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#c87832',
          logo: 'https://primisprotocol.ai/logo.svg',
        },
        embeddedWallets: {
          createOnLogin: 'off', // AI builders don't need wallets for fiat payments
        },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>,
)
