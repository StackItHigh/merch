// ✅ Wagmi + Viem (installed via npm)
import { createConfig } from 'wagmi'
import { http } from 'viem'

// ✅ Reown AppKit & Wagmi adapter
import { createAppKit } from '@reown/appkit'
import { mainnet, base } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

// King of Apes Configuration
const CONFIG = {
    NFT_CONTRACT_ADDRESS: "0xF98082c5978B57AdD900E5544fcaE56AdAA871Fa",
    BASE_CHAIN_ID: 8453,
    STORE_URL: "https://kingofapes.shop",
    SESSION_DURATION: 24
};

// ✅ Your Reown projectId
const projectId = "916c2c0116b80bc0aa50ad643876189b"

// Networks
export const networks = [base, mainnet]

// 1. Set up Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks
})

// Get wagmi config for proper connection handling
export const wagmiConfig = wagmiAdapter.wagmiConfig

// 2. Metadata - dynamically set URL based on environment
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const baseUrl = isDevelopment ? window.location.origin : "https://merch-blond-three.vercel.app";

const metadata = {
    name: "King of Apes VIP Gate",
    description: "NFT-gated access to King of Apes store",
    url: baseUrl,
    icons: [`${baseUrl}/koanft.png`]
}

// 3. Create AppKit modal
const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    metadata,
    projectId,
    features: {
        analytics: true // Optional - defaults to your Cloud configuration
    }
})

console.log("AppKit initialized:", modal)

// --- DOM elements ---
const walletSection = document.getElementById("wallet-section");
const statusSection = document.getElementById("status-section");
const errorSection = document.getElementById("error-section");
const successSection = document.getElementById("success-section");
const disconnectBtn = document.getElementById("disconnect-btn");
const retryBtn = document.getElementById("retry-btn");
const enterStoreBtn = document.getElementById("enter-store-btn");
const statusText = document.getElementById("status-text");
const errorText = document.getElementById("error-text");
const walletInfo = document.getElementById("wallet-info");
const connectWalletBtn = document.getElementById("connect-wallet-btn");
const connectedActions = document.getElementById("connected-actions");
const successDisconnectBtn = document.getElementById("success-disconnect-btn");
const verifyNftBtn = document.getElementById("verify-nft-btn");
const sessionActions = document.getElementById("session-actions");
const enterStoreFromSessionBtn = document.getElementById("enter-store-from-session-btn");
const clearSessionBtn = document.getElementById("clear-session-btn");

let currentWalletAddress = null;

// --- Event listeners ---
disconnectBtn?.addEventListener("click", disconnectWallet);
retryBtn?.addEventListener("click", () => {
    resetToWalletSection();
    modal.open();
});
enterStoreBtn?.addEventListener("click", () => window.location.href = CONFIG.STORE_URL);

// Connect wallet button
connectWalletBtn?.addEventListener("click", async () => {
    console.log("Connect wallet button clicked - forcing connection view...");
    
    // Force clear ALL AppKit state
    try {
        await modal.disconnect();
        console.log("Disconnected from modal");
        
        // Clear localStorage that AppKit might be using
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('wagmi') || key.includes('appkit') || key.includes('walletconnect') || key.includes('w3m'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log("Removed localStorage key:", key);
        });
        
    } catch (error) {
        console.log("Error clearing state:", error);
    }
    
    // Force open in connection mode with specific view
    setTimeout(() => {
        try {
            modal.open({ view: 'Connect' });
            console.log("Opened modal in Connect view");
        } catch (error) {
            console.log("Connect view failed, trying default open");
            modal.open();
        }
    }, 200);
});

// Success screen disconnect button
successDisconnectBtn?.addEventListener("click", () => {
    console.log("Disconnecting from success screen...");
    disconnectWallet();
});

// Manual NFT verification button
verifyNftBtn?.addEventListener("click", async () => {
    const address = modal.getAddress();
    if (address) {
        console.log("Manual NFT verification requested for address:", address);
        showStatus("Verifying NFT ownership...");
        await checkNFTOwnership(address);
    } else {
        showError("Please connect your wallet first");
    }
});

// Session management buttons
enterStoreFromSessionBtn?.addEventListener("click", () => {
    window.location.href = CONFIG.STORE_URL;
});

clearSessionBtn?.addEventListener("click", () => {
    localStorage.removeItem("nft_verification");
    resetToWalletSection();
    console.log("Session cleared");
});


// Check session and wallet connection on load
window.addEventListener("load", async () => {
    console.log("Page loaded, checking session and wallet...");
    
    // Give AppKit time to initialize
    setTimeout(async () => {
        const address = modal.getAddress();
        const isConnected = modal.getIsConnected?.() || false;
        console.log("Load check - AppKit address:", address);
        console.log("Load check - AppKit connected:", isConnected);
        
        // If there's an address but not connected, clear the stale state
        if (address && !isConnected) {
            console.log("Found stale wallet data, clearing...");
            try {
                await modal.disconnect();
                console.log("Cleared stale wallet state");
            } catch (error) {
                console.log("Error clearing stale state:", error);
            }
        }
        
        if (address && isConnected) {
            console.log("Found REAL wallet connection on load:", address);
            handleWalletConnection(address);
        } else if (hasValidSession()) {
            console.log("Valid session found, showing session options");
            showSessionOptions();
        } else {
            console.log("No real wallet connection found on load - showing connect button");
            resetWalletDisplay();
            resetToWalletSection();
        }
    }, 1500); // Give AppKit more time to initialize
});

// Listen to AppKit state changes properly
modal.subscribeState((state) => {
    console.log("AppKit state changed:", state);
    
    const address = modal.getAddress();
    const isConnected = modal.getIsConnected?.() || false;
    
    console.log("State change - Address:", address);
    console.log("State change - Connected:", isConnected);
    console.log("Stored currentWalletAddress:", currentWalletAddress);

    // Handle connection - if we have an address, assume connected (AppKit bug with isConnected)
    if (address && address !== currentWalletAddress) {
        console.log("New wallet connected via AppKit (address detected):", address);
        handleWalletConnection(address);
    }
    
    // Handle disconnection
    if (!address && currentWalletAddress) {
        console.log("Wallet disconnected, resetting UI");
        currentWalletAddress = null;
        resetWalletDisplay();
        resetToWalletSection();
    }
    
    // Check for connection when modal closes
    if (state.open === false && address && !currentWalletAddress) {
        console.log("Modal closed, checking for new connection...");
        setTimeout(() => {
            const finalAddress = modal.getAddress();
            const finalConnected = modal.getIsConnected?.() || false;
            console.log("Final check - Address:", finalAddress, "Connected:", finalConnected);
            
            if (finalAddress && finalAddress !== currentWalletAddress) {
                console.log("Found connection after modal close:", finalAddress);
                handleWalletConnection(finalAddress);
            }
        }, 1000);
    }
});

// Also listen to wagmi account changes for more reliable detection
try {
    wagmiConfig.subscribe(
        (state) => state.current,
        (account) => {
            console.log("Wagmi account changed:", account);
            console.log("Account isConnected:", account?.isConnected);
            console.log("Account address:", account?.address);
            
            // Give a small delay for state to settle
            setTimeout(() => {
                const modalAddress = modal.getAddress();
                const modalConnected = modal.getIsConnected?.() || false;
                
                console.log("Post-change check - Modal address:", modalAddress);
                console.log("Post-change check - Modal connected:", modalConnected);
                
                if (account?.address && account.address !== currentWalletAddress) {
                    console.log("Wagmi detected NEW CONNECTION:", account.address);
                    handleWalletConnection(account.address);
                } else if (modalAddress && modalAddress !== currentWalletAddress) {
                    console.log("Modal detected NEW CONNECTION:", modalAddress);
                    handleWalletConnection(modalAddress);
                } else if (!account?.address && !modalAddress && currentWalletAddress) {
                    console.log("Wagmi detected disconnection");
                    currentWalletAddress = null;
                    resetWalletDisplay();
                    resetToWalletSection();
                }
            }, 500); // Give state time to settle
        }
    );
} catch (error) {
    console.log("Wagmi subscription setup failed:", error);
}

async function handleWalletConnection(walletAddress) {
    if (!walletAddress) return;

    currentWalletAddress = walletAddress;

    // Show wallet info and connected actions
    const shortAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`;
    walletInfo.textContent = `Connected: ${shortAddress}`;
    walletInfo.classList.remove("hidden");
    
    // Hide connect button, show verify/disconnect/switch buttons
    connectWalletBtn.classList.add("hidden");
    connectedActions.classList.remove("hidden");

    showStatus("Connected! Checking network...");

    // Ensure Base chain
    const currentChain = modal.getChainId();
    console.log("Current chain:", currentChain, "Expected:", CONFIG.BASE_CHAIN_ID);

    if (currentChain !== CONFIG.BASE_CHAIN_ID) {
        showStatus("Please switch to Base network...");
        try {
            await modal.switchActiveNetwork(CONFIG.BASE_CHAIN_ID);
        } catch (error) {
            console.error("Network switch error:", error);
            showError("Please manually switch to Base network and try again.");
            return;
        }
    }

    // Don't auto-verify - let user click "Verify NFT Ownership" button
    resetToWalletSection();
}

function disconnectWallet() {
    try {
        localStorage.removeItem("nft_verification");
    } catch (e) {
        console.log("LocalStorage not available");
    }

    modal.disconnect();
    currentWalletAddress = null;
    resetWalletDisplay();
    resetToWalletSection();
}

function resetWalletDisplay() {
    walletInfo.classList.add("hidden");
    connectedActions.classList.add("hidden");
    sessionActions.classList.add("hidden");
    connectWalletBtn.classList.remove("hidden");
}

function showSessionOptions() {
    connectWalletBtn.classList.add("hidden");
    connectedActions.classList.add("hidden");
    sessionActions.classList.remove("hidden");
}

// SIMPLE NFT ownership verification function
async function checkNFTOwnership(walletAddress) {
    console.log(`Checking NFT ownership for wallet: ${walletAddress}`);
    console.log(`Contract address: ${CONFIG.NFT_CONTRACT_ADDRESS}`);
    
    // Simple ERC721 balance check
    const functionSelector = "0x70a08231"; // balanceOf(address)
    const paddedAddress = walletAddress.slice(2).padStart(64, "0");
    const data = functionSelector + paddedAddress;

    try {
        const response = await fetch("https://mainnet.base.org", {
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
        console.log("RPC Response:", result);

        if (result.result && result.result !== "0x") {
            const balance = parseInt(result.result, 16);
            console.log(`NFT Balance: ${balance}`);
            
            if (balance > 0) {
                console.log("✅ NFT FOUND! Granting access...");
                
                // Store verification
                const verification = {
                    walletAddress,
                    timestamp: Date.now(),
                    expiresAt: Date.now() + (CONFIG.SESSION_DURATION * 60 * 60 * 1000)
                };
                localStorage.setItem("nft_verification", JSON.stringify(verification));
                
                // Show success and redirect
                showSuccess();
                return;
            }
        }
        
        // No NFT found
        console.log("❌ No NFT found");
        showError("No King of Apes NFT found in your wallet.");
        
    } catch (error) {
        console.error("Error checking NFT:", error);
        showError("Error verifying NFT ownership. Please try again.");
    }
}

function hasValidSession() {
    try {
        const stored = localStorage.getItem("nft_verification");
        if (!stored) return false;

        const verification = JSON.parse(stored);
        if (Date.now() > verification.expiresAt) {
            localStorage.removeItem("nft_verification");
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function showSection(activeSection) {
    [walletSection, statusSection, errorSection, successSection].forEach(s => {
        s?.classList.add("hidden");
    });
    activeSection?.classList.remove("hidden");
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
    
    // Generate and include access token for store entry
    const accessToken = generateAccessToken(currentWalletAddress);
    
    // Update the "Enter Store Now" button to include the token
    const enterStoreBtn = document.getElementById('enter-store-btn');
    if (enterStoreBtn) {
        enterStoreBtn.onclick = () => {
            window.location.href = `${CONFIG.STORE_URL}?token=${accessToken}`;
        };
    }
}

// Add token generation function
function generateAccessToken(walletAddress) {
    const payload = {
        wallet: walletAddress,
        verified: true,
        exp: Date.now() + (CONFIG.SESSION_DURATION * 60 * 60 * 1000) // 24 hours
    };
    
    // Simple signed token (basic implementation)
    const token = btoa(JSON.stringify(payload));
    const signature = btoa(token + "koa-secret-key-2024"); // Use a consistent secret
    
    return `${token}.${signature}`;
}
