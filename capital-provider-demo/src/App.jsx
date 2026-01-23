import { useState, useEffect, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import Header from './components/Header'
import StatsBar from './components/StatsBar'
import Dashboard from './components/Dashboard'
import ConnectWallet from './components/ConnectWallet'
import DepositModal from './components/DepositModal'
import WithdrawModal from './components/WithdrawModal'
import TrustFooter from './components/TrustFooter'
import { ToastContainer } from './components/Toast'
import * as api from './api'
import * as solana from './solana'
import './App.css'

// Generate a realistic Solana address (for demo until real wallet connected)
const generateSolAddress = () => {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let address = ''
  for (let i = 0; i < 44; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return address
}

// Simulated portfolio data (will be replaced with real data from backend)
const createPortfolioData = (stakedAmount) => {
  const daysStaked = 47
  const baseApy = 0.068 // 6.8% base staking APY
  const revenueApy = 0.006 // 0.6% from compute revenue
  const effectiveApy = baseApy + revenueApy
  
  const yieldEarned = stakedAmount * (baseApy / 365) * daysStaked
  const revenueEarned = stakedAmount * (revenueApy / 365) * daysStaked
  const totalEarned = yieldEarned + revenueEarned
  
  return {
    stakedAmount,
    totalEarned,
    yieldEarned,
    revenueEarned,
    effectiveApy: effectiveApy * 100,
    daysStaked,
    networkUtilization: 63 + Math.floor(Math.random() * 15),
    currentEpoch: 421,
    allocation: {
      staker: 70,
      subsidy: 20,
      reserve: 10
    }
  }
}

// Generate activity feed (will be replaced with real data)
const generateActivityFeed = () => [
  { id: 'f8k2', type: 'fine-tune', amount: 0.24, time: '2h ago' },
  { id: 'a3m9', type: 'embed-batch', amount: 0.18, time: '4h ago' },
  { id: 't1x7', type: 'train', amount: 0.82, time: '6h ago' },
  { id: 'b2n4', type: 'inference', amount: 0.09, time: '8h ago' },
  { id: 'c5p1', type: 'fine-tune', amount: 0.31, time: '12h ago' },
]

// Generate earnings history (30 days) - will be replaced with real data
const generateEarningsHistory = () => {
  const history = []
  for (let i = 29; i >= 0; i--) {
    history.push({
      day: i,
      yield: 0.3 + Math.random() * 0.2,
      revenue: 0.05 + Math.random() * 0.15
    })
  }
  return history
}

function App() {
  // Solana wallet adapter hooks
  const { publicKey, connected, signTransaction, signAllTransactions, disconnect } = useWallet()
  const { connection } = useConnection()
  
  // Local state
  const [portfolio, setPortfolio] = useState(null)
  const [activity, setActivity] = useState([])
  const [earningsHistory, setEarningsHistory] = useState([])
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [backendConnected, setBackendConnected] = useState(false)
  const [onChainStake, setOnChainStake] = useState(null)
  const [vaultState, setVaultState] = useState(null)

  // Create wallet object for components (compatible with existing UI)
  const wallet = connected && publicKey ? {
    address: publicKey.toString(),
    balance: walletBalance,
    connected: true,
    publicKey: publicKey,
    signTransaction,
    signAllTransactions,
  } : null

  // Add toast notification
  const addToast = useCallback((message, amount) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, amount }])
  }, [])

  // Remove toast
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Handle disconnect
  const handleDisconnect = () => {
    disconnect()
    setPortfolio(null)
    setActivity([])
    setEarningsHistory([])
    setWalletBalance(0)
    setOnChainStake(null)
  }

  // Refresh on-chain data (used after claiming yield)
  const refreshOnChainData = useCallback(async () => {
    if (!publicKey) return
    
    try {
      // Refresh wallet balance
      const balanceLamports = await connection.getBalance(publicKey)
      setWalletBalance(balanceLamports / LAMPORTS_PER_SOL)
      
      // Refresh stake account
      const stakeAccount = await solana.getStakeAccount(publicKey)
      setOnChainStake(stakeAccount)
      
      // Refresh vault state
      const vault = await solana.getVaultState()
      if (vault) setVaultState(vault)
      
      // Update portfolio
      if (stakeAccount) {
        setPortfolio(prev => prev ? {
          ...prev,
          stakedAmount: stakeAccount.amount,
          totalYieldClaimed: stakeAccount.totalYieldClaimed,
        } : prev)
      }
      
      console.log('Refreshed on-chain data')
    } catch (err) {
      console.error('Error refreshing data:', err)
    }
  }, [publicKey, connection])

  // Check backend connectivity and fetch vault state on mount
  useEffect(() => {
    api.checkHealth().then(result => {
      setBackendConnected(result.connected)
      if (result.connected) {
        console.log('Backend connected:', result)
      }
    })
    
    // Fetch vault state from devnet
    solana.getVaultState().then(vault => {
      if (vault) {
        setVaultState(vault)
        console.log('Vault state from devnet:', vault)
      }
    })
  }, [])

  // Fetch real on-chain data when wallet connects
  useEffect(() => {
    const fetchOnChainData = async () => {
      if (!publicKey) return
      
      try {
        console.log('Fetching on-chain data for:', publicKey.toString())
        
        // Fetch real wallet SOL balance from devnet
        const balanceLamports = await connection.getBalance(publicKey)
        const balance = balanceLamports / LAMPORTS_PER_SOL
        setWalletBalance(balance)
        console.log('Real wallet balance:', balance, 'SOL')
        
        // Fetch stake account from contract
        const stakeAccount = await solana.getStakeAccount(publicKey)
        setOnChainStake(stakeAccount)
        
        if (stakeAccount) {
          console.log('On-chain stake:', stakeAccount)
        } else {
          console.log('No stake account found (user has not staked yet)')
        }
        
        // Fetch vault state
        const vault = await solana.getVaultState()
        if (vault) {
          setVaultState(vault)
        }
      } catch (err) {
        console.error('Error fetching on-chain data:', err)
      }
    }
    
    if (connected && publicKey) {
      fetchOnChainData()
    }
    
    // Refresh every 15 seconds when connected
    const interval = connected ? setInterval(fetchOnChainData, 15000) : null
    return () => interval && clearInterval(interval)
  }, [connected, publicKey, connection])

  // Initialize portfolio data when wallet connects
  useEffect(() => {
    if (connected && publicKey && !portfolio) {
      setIsLoading(true)
      
      const initializePortfolio = async () => {
        try {
          // Check if user has on-chain stake
          const stakeAccount = await solana.getStakeAccount(publicKey)
          
          if (stakeAccount && stakeAccount.amount > 0) {
            // User has real stake - use on-chain data
            setPortfolio({
              stakedAmount: stakeAccount.amount,
              totalEarned: stakeAccount.totalYieldClaimed,
              yieldEarned: stakeAccount.totalYieldClaimed,
              revenueEarned: 0,
              effectiveApy: 7.4,
              daysStaked: Math.floor((Date.now() / 1000 - stakeAccount.depositedAt) / 86400),
              networkUtilization: 63 + Math.floor(Math.random() * 15),
              currentEpoch: 421,
              allocation: { staker: 70, subsidy: 20, reserve: 10 }
            })
            console.log('Portfolio initialized from on-chain stake:', stakeAccount.amount, 'SOL')
          } else {
            // No stake yet - show empty portfolio
            setPortfolio({
              stakedAmount: 0,
              totalEarned: 0,
              yieldEarned: 0,
              revenueEarned: 0,
              effectiveApy: 7.4,
              daysStaked: 0,
              networkUtilization: 63 + Math.floor(Math.random() * 15),
              currentEpoch: 421,
              allocation: { staker: 70, subsidy: 20, reserve: 10 }
            })
            console.log('No existing stake - empty portfolio')
          }
          
          setActivity(generateActivityFeed())
          setEarningsHistory(generateEarningsHistory())
          
        } catch (err) {
          console.error('Failed to initialize portfolio:', err)
          // Fallback to empty portfolio
          setPortfolio({
            stakedAmount: 0,
            totalEarned: 0,
            yieldEarned: 0,
            revenueEarned: 0,
            effectiveApy: 7.4,
            daysStaked: 0,
            networkUtilization: 63,
            currentEpoch: 421,
            allocation: { staker: 70, subsidy: 20, reserve: 10 }
          })
          setActivity(generateActivityFeed())
          setEarningsHistory(generateEarningsHistory())
        } finally {
          setIsLoading(false)
        }
      }
      
      initializePortfolio()
    }
  }, [connected, publicKey, portfolio])

  // Deposit SOL - Real on-chain transaction
  const handleDeposit = async (amount) => {
    setIsLoading(true)
    try {
      // Check minimum stake for first deposit
      if (!onChainStake && amount < solana.MINIMUM_STAKE) {
        throw new Error(`Minimum first deposit is ${solana.MINIMUM_STAKE} SOL`)
      }
      
      if (!publicKey || !signTransaction) {
        throw new Error('Wallet not connected')
      }
      
      console.log('Initiating REAL on-chain deposit of', amount, 'SOL...')
      
      // Create wallet object for signing
      const walletForSigning = {
        publicKey,
        signTransaction,
        signAllTransactions,
      }
      
      // Execute real on-chain deposit
      const txSignature = await solana.depositSOL(walletForSigning, amount)
      
      console.log('✅ Deposit tx:', txSignature)
      console.log('View on Solscan:', solana.getSolscanLink(txSignature))
      
      // Refresh real on-chain data
      const newBalance = await connection.getBalance(publicKey)
      setWalletBalance(newBalance / LAMPORTS_PER_SOL)
      
      const newStakeAccount = await solana.getStakeAccount(publicKey)
      setOnChainStake(newStakeAccount)
      
      const newVault = await solana.getVaultState()
      if (newVault) setVaultState(newVault)
      
      // Update portfolio with real on-chain data
      if (newStakeAccount) {
        setPortfolio(prev => ({
          ...prev,
          stakedAmount: newStakeAccount.amount,
        }))
      }
      
      setShowDepositModal(false)
      addToast(`Deposited ${amount} SOL on-chain!`, amount)
      
    } catch (err) {
      console.error('Deposit failed:', err)
      addToast(err.message || 'Deposit failed', 0)
    } finally {
      setIsLoading(false)
    }
  }

  // Withdraw SOL - Real on-chain transaction
  const handleWithdraw = async (amount) => {
    setIsLoading(true)
    try {
      const currentStake = onChainStake?.amount || portfolio?.stakedAmount || 0
      if (currentStake < amount) {
        throw new Error('Insufficient staked balance')
      }
      
      // Check minimum remaining stake (unless full withdrawal)
      const remaining = currentStake - amount
      if (remaining > 0 && remaining < solana.MINIMUM_STAKE) {
        throw new Error(`Remaining stake must be at least ${solana.MINIMUM_STAKE} SOL (or withdraw all)`)
      }
      
      if (!publicKey || !signTransaction) {
        throw new Error('Wallet not connected')
      }
      
      console.log('Initiating REAL on-chain withdrawal of', amount, 'SOL...')
      
      // Create wallet object for signing
      const walletForSigning = {
        publicKey,
        signTransaction,
        signAllTransactions,
      }
      
      // Execute real on-chain withdrawal
      const txSignature = await solana.withdrawSOL(walletForSigning, amount)
      
      console.log('✅ Withdraw tx:', txSignature)
      console.log('View on Solscan:', solana.getSolscanLink(txSignature))
      
      // Refresh real on-chain data
      const newBalance = await connection.getBalance(publicKey)
      setWalletBalance(newBalance / LAMPORTS_PER_SOL)
      
      const newStakeAccount = await solana.getStakeAccount(publicKey)
      setOnChainStake(newStakeAccount)
      
      const newVault = await solana.getVaultState()
      if (newVault) setVaultState(newVault)
      
      // Update portfolio with real on-chain data
      setPortfolio(prev => ({
        ...prev,
        stakedAmount: newStakeAccount?.amount || 0,
      }))
      
      setShowWithdrawModal(false)
      addToast(`Withdrew ${amount} SOL on-chain!`, amount)
      
    } catch (err) {
      console.error('Withdraw failed:', err)
      addToast(err.message || 'Withdrawal failed', 0)
    } finally {
      setIsLoading(false)
    }
  }

  // Simulate live activity updates
  useEffect(() => {
    if (!connected || !portfolio) return
    
    const interval = setInterval(() => {
      // Randomly add new activity
      if (Math.random() > 0.7) {
        const types = ['fine-tune', 'embed-batch', 'train', 'inference']
        const type = types[Math.floor(Math.random() * types.length)]
        const amount = 0.05 + Math.random() * 0.5
        const newActivity = {
          id: Math.random().toString(36).substr(2, 4),
          type,
          amount,
          time: 'just now'
        }
        setActivity(prev => [newActivity, ...prev.slice(0, 4)])
        
        // Update portfolio with new revenue
        const userShare = amount * 0.01
        setPortfolio(prev => ({
          ...prev,
          revenueEarned: prev.revenueEarned + userShare,
          totalEarned: prev.totalEarned + userShare
        }))
        
        // Show toast notification
        addToast(`${type} job completed`, userShare)
      }
    }, 8000)
    
    return () => clearInterval(interval)
  }, [connected, portfolio, addToast])

  return (
    <div className="app">
      <div className="noise-overlay" />
      <div className="grid-pattern" />
      
      <Header 
        wallet={wallet}
        onDisconnect={handleDisconnect}
        isLoading={isLoading}
      />
      
      {wallet && <StatsBar vaultState={vaultState} />}
      
      <main className={`main-content ${wallet ? 'with-stats-bar' : ''}`}>
        {!connected ? (
          <ConnectWallet isLoading={isLoading} />
        ) : (
          <Dashboard
            wallet={wallet}
            portfolio={portfolio}
            activity={activity}
            earningsHistory={earningsHistory}
            onDeposit={() => setShowDepositModal(true)}
            onWithdraw={() => setShowWithdrawModal(true)}
            onChainStake={onChainStake}
            vaultState={vaultState}
            onRefresh={refreshOnChainData}
          />
        )}
      </main>
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {wallet && <TrustFooter />}

      {showDepositModal && (
        <DepositModal
          wallet={wallet}
          onDeposit={handleDeposit}
          onClose={() => setShowDepositModal(false)}
          isLoading={isLoading}
          currentStake={onChainStake?.amount || 0}
        />
      )}

      {showWithdrawModal && (
        <WithdrawModal
          portfolio={portfolio}
          onWithdraw={handleWithdraw}
          onClose={() => setShowWithdrawModal(false)}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}

export default App
