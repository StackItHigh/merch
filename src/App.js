import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { base, mainnet } from '@reown/appkit/networks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import './App.css';

// King of Apes Configuration
const CONFIG = {
  NFT_CONTRACT_ADDRESS: "0xF98082c5978B57AdD900E5544fcaE56AdAA871Fa",
  BASE_CHAIN_ID: 8453,
  STORE_URL: "https://kingofapes.shop",
  SESSION_DURATION: 24,
  PROJECT_ID: "916c2c0116b80bc0aa50ad643876189b"
};

// Setup Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
  projectId: CONFIG.PROJECT_ID,
  networks: [base, mainnet]
});

// Create AppKit modal
const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks: [base, mainnet],
  metadata: {
    name: "King of Apes VIP Gate",
    description: "NFT-gated access to King of Apes store",
    url: "https://kingofapes.shop",
    icons: ["https://merch-blond-three.vercel.app/koanft.png"],
    redirect: {
      native: "https://kingofapes.shop",
      universal: "https://kingofapes.shop"
    }
  },
  projectId: CONFIG.PROJECT_ID,
  features: {
    analytics: true,
    socials: false,
    email: false,
    onramp: false
  },
  themeMode: 'dark'
});

const queryClient = new QueryClient();

function KOAApp() {
  const [walletAddress, setWalletAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasNFT, setHasNFT] = useState(false);
  const [nftBalance, setNftBalance] = useState(0);
  const [currentStep, setCurrentStep] = useState('connect');
  const [error, setError] = useState('');

  useEffect(() => {
    checkExistingSession();
    
    // Subscribe to modal state changes
    const unsubscribe = modal.subscribeState((state) => {
      console.log('Modal state:', state);
      
      const address = modal.getAddress();
      if (address && address !== walletAddress) {
        console.log('New wallet connected:', address);
        setWalletAddress(address);
        setCurrentStep('verify');
        setError('');
      } else if (!address && walletAddress) {
        console.log('Wallet disconnected');
        handleDisconnect();
      }
    });

    return () => unsubscribe?.();
  }, [walletAddress]);

  const checkExistingSession = () => {
    try {
      const storedSession = localStorage.getItem('koa_session');
      if (storedSession) {
        const session = JSON.parse(storedSession);
        if (session.exp > Date.now()) {
          setWalletAddress(session.wallet);
          setHasNFT(session.verified);
          setNftBalance(session.nftCount || 0);
          setCurrentStep(session.verified ? 'success' : 'verify');
        } else {
          localStorage.removeItem('koa_session');
        }
      }
    } catch (error) {
      console.log('Error checking session:', error);
    }
  };

  const connectWallet = () => {
    setError('');
    modal.open();
  };

  const checkNFTOwnership = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      
      console.log(`Checking NFT ownership for: ${walletAddress}`);
      
      // ERC721 balanceOf call
      const functionSelector = "0x70a08231";
      const paddedAddress = walletAddress.slice(2).padStart(64, "0");
      const data = functionSelector + paddedAddress;

      const rpcUrls = [
        "https://mainnet.base.org",
        "https://base.llamarpc.com",
        "https://base.blockpi.network/v1/rpc/public"
      ];

      let balance = 0;
      for (const rpcUrl of rpcUrls) {
        try {
          const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_call",
              params: [{
                to: CONFIG.NFT_CONTRACT_ADDRESS,
                data: data
              }, "latest"],
              id: 1
            })
          });

          const result = await response.json();
          
          if (result.result && result.result !== "0x") {
            balance = parseInt(result.result, 16);
            console.log(`NFT Balance: ${balance}`);
            break;
          }
        } catch (error) {
          console.log(`RPC ${rpcUrl} failed:`, error);
          continue;
        }
      }
      
      setNftBalance(balance);
      
      if (balance > 0) {
        setHasNFT(true);
        setCurrentStep('success');
        
        // Store session
        const session = {
          wallet: walletAddress,
          verified: true,
          exp: Date.now() + (CONFIG.SESSION_DURATION * 60 * 60 * 1000),
          nftCount: balance
        };
        localStorage.setItem('koa_session', JSON.stringify(session));
        
        console.log('✅ NFT FOUND! Access granted');
      } else {
        setHasNFT(false);
        setError('No King of Apes NFT found in your wallet.');
      }
      
    } catch (error) {
      console.error("Error checking NFT:", error);
      setError('Error verifying NFT ownership. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('koa_session');
    setWalletAddress('');
    setHasNFT(false);
    setNftBalance(0);
    setCurrentStep('connect');
    setError('');
    modal.disconnect();
  };

  const openStore = () => {
    const accessToken = generateAccessToken();
    const storeUrl = `${CONFIG.STORE_URL}?token=${accessToken}`;
    window.open(storeUrl, '_blank');
  };

  const generateAccessToken = () => {
    const payload = {
      wallet: walletAddress,
      verified: true,
      exp: Date.now() + (CONFIG.SESSION_DURATION * 60 * 60 * 1000),
      nftCount: nftBalance
    };
    
    return btoa(JSON.stringify(payload));
  };

  const renderConnectScreen = () => (
    <div className="screen">
      <img 
        src="https://merch-blond-three.vercel.app/koanft.png" 
        alt="King of Apes" 
        className="logo"
      />
      <h1 className="title">King of Apes</h1>
      <h2 className="subtitle">VIP Gate</h2>
      <p className="description">
        Connect your wallet to verify King of Apes NFT ownership and access exclusive store content.
      </p>
      
      <button 
        className="connect-button"
        onClick={connectWallet}
      >
        Connect Wallet
      </button>
      
      {error && <div className="error">{error}</div>}
    </div>
  );

  const renderVerifyScreen = () => (
    <div className="screen">
      <img 
        src="https://merch-blond-three.vercel.app/koanft.png" 
        alt="King of Apes" 
        className="logo"
      />
      <h1 className="title">Wallet Connected</h1>
      <div className="wallet-address">
        {`${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`}
      </div>
      
      <button 
        className="verify-button"
        onClick={checkNFTOwnership}
        disabled={isLoading}
      >
        {isLoading ? 'Verifying...' : 'Verify NFT Ownership'}
      </button>
      
      <button 
        className="disconnect-button"
        onClick={handleDisconnect}
      >
        Disconnect Wallet
      </button>
      
      {error && <div className="error">{error}</div>}
    </div>
  );

  const renderSuccessScreen = () => (
    <div className="screen">
      <img 
        src="https://merch-blond-three.vercel.app/koanft.png" 
        alt="King of Apes" 
        className="logo"
      />
      <h1 className="success-title">Welcome, King of Apes holder!</h1>
      <p className="success-subtitle">
        You own {nftBalance} King of Apes NFT{nftBalance !== 1 ? 's' : ''}
      </p>
      <p className="success-subtitle">Access granted to exclusive store content</p>
      
      <button 
        className="store-button"
        onClick={openStore}
      >
        Enter Store Now
      </button>
      
      <button 
        className="disconnect-button"
        onClick={handleDisconnect}
      >
        Disconnect & Exit
      </button>
    </div>
  );

  const getCurrentScreen = () => {
    switch (currentStep) {
      case 'verify':
        return renderVerifyScreen();
      case 'success':
        return renderSuccessScreen();
      default:
        return renderConnectScreen();
    }
  };

  return (
    <div className="app">
      {getCurrentScreen()}
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <KOAApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;