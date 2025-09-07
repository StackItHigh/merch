console.log('JavaScript file loaded!')

// Try jsdelivr CDN - better CORS support
import { createAppKit } from 'https://cdn.jsdelivr.net/npm/@reown/appkit@1.7.0/dist/esm/index.js'
import { WagmiAdapter } from 'https://cdn.jsdelivr.net/npm/@reown/appkit-adapter-wagmi@1.7.0/dist/esm/index.js'

// King of Apes Configuration
const CONFIG = {
    NFT_CONTRACT_ADDRESS: "0xd9B35e260422AC37d2126C49E1Cb178AC4342202",
    BASE_CHAIN_ID: 8453,
    STORE_URL: "/collections/all",
    SESSION_DURATION: 24
};

// 1. Get project ID from Reown Dashboard
const projectId = '916c2c0116b80bc0aa50ad643876189b'

// 2. Define networks manually since CDN networks might be broken
const networks = [
    {
        id: 8453,
        name: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
        blockExplorers: { default: { name: 'BaseScan', url: 'https://basescan.org' } }
    },
    {
        id: 1,
        name: 'Ethereum',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: ['https://cloudflare-eth.com'] } },
        blockExplorers: { default: { name: 'Etherscan', url: 'https://etherscan.io' } }
    }
]

// 3. Set up Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks
})

// 4. Configure the metadata
const metadata = {
    name: 'King of Apes VIP Gate',
    description: 'NFT-gated access to King of Apes store',
    url: 'https://vip.kingofapes.shop',
    icons: ['https://vip.kingofapes.shop/koanft.png']
}

// 5. Create the modal using the unified configuration
const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    metadata,
    projectId,
    features: {
        analytics: true
    }
})

console.log('AppKit initialized:', modal)

// DOM elements
const walletSection = document.getElementById('wallet-section');
const statusSection = document.getElementById('status-section');
const errorSection = document.getElementById('error-section');
const successSection = document.getElementById('success-section');
const disconnectBtn = document.getElementById('disconnect-btn');
const retryBtn = document.getElementById('retry-btn');
const enterStoreBtn = document.getElementById('enter-store-btn');
const statusText = document.getElementById('status-text');
const errorText = document.getElementById('error-text');
const walletInfo = document.getElementById('wallet-info');

let currentWalletAddress = null;

// Event listeners
disconnectBtn?.addEventListener('click', disconnectWallet);
retryBtn?.addEventListener('click', () => {
    resetToWalletSection();
    modal.open();
});
enterStoreBtn?.addEventListener('click', () => window.location.href = CONFIG.STORE_URL);

// Check existing session on load
window.addEventListener('load', () => {
    console.log('Page loaded, checking session...')
    if (hasValidSession()) {
        showSuccess();
    }
});

// Listen to AppKit state changes
modal.subscribeState((state) => {
    console.log('AppKit state changed:', state);
    
    // Check if wallet is connected
    if (state.selectedNetworkId && modal.getAccount()?.address) {
        const address = modal.getAccount().address;
        if (address && address !== currentWalletAddress) {
            handleWalletConnection(address);
        }
    }
    
    // Handle disconnection
    if (!modal.getAccount()?.address && currentWalletAddress) {
        currentWalletAddress = null;
        resetWalletDisplay();
        resetToWalletSection();
    }
});

async function handleWalletConnection(walletAddress) {
    if (!walletAddress) return;
    
    currentWalletAddress = walletAddress;
    
    // Show wallet info and disconnect button
    const shortAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`;
    walletInfo.textContent = `Connected: ${shortAddress}`;
    walletInfo.classList.remove('hidden');
    disconnectBtn.classList.remove('hidden');

    showStatus("Connected! Checking network...");

    // Check if we're on Base network
    const currentChain = modal.getChainId();
    console.log('Current chain:', currentChain, 'Expected:', CONFIG.BASE_CHAIN_ID);
    
    if (currentChain !== CONFIG.BASE_CHAIN_ID) {
        showStatus("Please switch to Base network...");
        try {
            await modal.switchNetwork(CONFIG.BASE_CHAIN_ID);
        } catch (error) {
            console.error('Network switch error:', error);
            showError("Please manually switch to Base network and try again.");
            return;
        }
    }

    showStatus("Verifying NFT ownership...");
    console.log('Checking wallet:', walletAddress);
    console.log('Contract address:', CONFIG.NFT_CONTRACT_ADDRESS);
    await checkNFTOwnership(walletAddress);
}

function disconnectWallet() {
    try {
        localStorage.removeItem('nft_verification');
    } catch (e) {
        console.log('LocalStorage not available');
    }
    
    modal.disconnect();
    currentWalletAddress = null;
    resetWalletDisplay();
    resetToWalletSection();
}

function resetWalletDisplay() {
    walletInfo.classList.add('hidden');
    disconnectBtn.classList.add('hidden');
}

async function checkNFTOwnership(walletAddress) {
    try {
        // Use Base RPC to check NFT balance
        const rpcUrl = 'https://mainnet.base.org';
        
        // Encode the function call for balanceOf(address)
        const functionSelector = '0x70a08231'; // balanceOf(address)
        const paddedAddress = walletAddress.slice(2).padStart(64, '0');
        const data = functionSelector + paddedAddress;

        console.log('Making RPC call to:', rpcUrl);
        console.log('Contract:', CONFIG.NFT_CONTRACT_ADDRESS);
        console.log('Wallet:', walletAddress);

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: CONFIG.NFT_CONTRACT_ADDRESS,
                    data: data
                }, 'latest'],
                id: 1
            })
        });

        const result = await response.json();
        console.log('RPC response:', result);
        
        if (result.error) {
            throw new Error(result.error.message);
        }

        // Parse the hex result to check if balance > 0
        const balance = parseInt(result.result, 16);
        console.log('NFT balance:', balance);

        if (balance > 0) {
            const verification = {
                walletAddress,
                timestamp: Date.now(),
                expiresAt: Date.now() + (CONFIG.SESSION_DURATION * 60 * 60 * 1000)
            };
            
            try {
                localStorage.setItem('nft_verification', JSON.stringify(verification));
            } catch (e) {
                console.log('LocalStorage not available, but NFT verified');
            }
            
            showSuccess();
        } else {
            showError("No King of Apes NFT found in your wallet.");
        }
    } catch (error) {
        console.error('NFT verification error:', error);
        showError(`Failed to verify NFT ownership: ${error.message}`);
    }
}

function hasValidSession() {
    try {
        const stored = localStorage.getItem('nft_verification');
        if (!stored) return false;

        const verification = JSON.parse(stored);
        if (Date.now() > verification.expiresAt) {
            localStorage.removeItem('nft_verification');
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function showSection(activeSection) {
    [walletSection, statusSection, errorSection, successSection].forEach(section => {
        section?.classList.add('hidden');
    });
    activeSection?.classList.remove('hidden');
}

function resetToWalletSection() {
    showSection(walletSection);
}

function showStatus(message) {
    statusText.textContent = message;
    showSection(statusSection);
}

function showError(message) {
    errorText.textContent = message;
    showSection(errorSection);
}

function showSuccess() {
    showSection(successSection);
    setTimeout(() => window.location.href = CONFIG.STORE_URL, 3000);
}