// ✅ Wagmi + Viem (installed via npm)
import { createConfig } from 'wagmi'
import { http } from 'viem'

// ✅ Reown AppKit & Wagmi adapter
import { createAppKit } from '@reown/appkit'
import { mainnet, base } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

// King of Apes Configuration
const CONFIG = {
    NFT_CONTRACT_ADDRESS: "0xd9B35e260422AC37d2126C49E1Cb178AC4342202",
    BASE_CHAIN_ID: 8453,
    STORE_URL: "/collections/all",
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

// 2. Metadata
const metadata = {
    name: "King of Apes VIP Gate",
    description: "NFT-gated access to King of Apes store",
    url: "https://merch-blond-three.vercel.app",
    icons: ["https://merch-blond-three.vercel.app/koanft.png"]
}

// 3. Create AppKit modal
const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    metadata,
    projectId,
    features: {
        analytics: true
    },
    connectors: {
        coinbaseWallet: false,   // 🚫 disable broken Coinbase import
        walletConnect: {
            projectId,           // ✅ required for WalletConnect QR
            showQrModal: true
        },
        injected: {              // ✅ enables MetaMask / Brave / Rabby
            shimDisconnect: true
        }
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

let currentWalletAddress = null;

// --- Event listeners ---
disconnectBtn?.addEventListener("click", disconnectWallet);
retryBtn?.addEventListener("click", () => {
    resetToWalletSection();
    modal.open();
});
enterStoreBtn?.addEventListener("click", () => window.location.href = CONFIG.STORE_URL);

// Check session on load
window.addEventListener("load", () => {
    console.log("Page loaded, checking session...");
    if (hasValidSession()) {
        showSuccess();
    }
});

// Listen to AppKit state changes
modal.subscribeState((state) => {
    console.log("AppKit state changed:", state);

    // If wallet connected
    if (state.selectedNetworkId && modal.getAccount()?.address) {
        const address = modal.getAccount().address;
        if (address && address !== currentWalletAddress) {
            handleWalletConnection(address);
        }
    }

    // If disconnected
    if (!modal.getAccount()?.address && currentWalletAddress) {
        currentWalletAddress = null;
        resetWalletDisplay();
        resetToWalletSection();
    }
});

async function handleWalletConnection(walletAddress) {
    if (!walletAddress) return;

    currentWalletAddress = walletAddress;

    // Show wallet info + disconnect
    const shortAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`;
    walletInfo.textContent = `Connected: ${shortAddress}`;
    walletInfo.classList.remove("hidden");
    disconnectBtn.classList.remove("hidden");

    showStatus("Connected! Checking network...");

    // Ensure Base chain
    const currentChain = modal.getChainId();
    console.log("Current chain:", currentChain, "Expected:", CONFIG.BASE_CHAIN_ID);

    if (currentChain !== CONFIG.BASE_CHAIN_ID) {
        showStatus("Please switch to Base network...");
        try {
            await modal.switchNetwork(CONFIG.BASE_CHAIN_ID);
        } catch (error) {
            console.error("Network switch error:", error);
            showError("Please manually switch to Base network and try again.");
            return;
        }
    }

    showStatus("Verifying NFT ownership...");
    await checkNFTOwnership(walletAddress);
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
    disconnectBtn.classList.add("hidden");
}

async function checkNFTOwnership(walletAddress) {
    try {
        const rpcUrl = "https://mainnet.base.org";

        // balanceOf(address)
        const functionSelector = "0x70a08231";
        const paddedAddress = walletAddress.slice(2).padStart(64, "0");
        const data = functionSelector + paddedAddress;

        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_call",
                params: [{
                    to: CONFIG.NFT_CONTRACT_ADDRESS,
                    data
                }, "latest"],
                id: 1
            })
        });

        const result = await response.json();
        if (result.error) throw new Error(result.error.message);

        const balance = parseInt(result.result, 16);
        console.log("NFT balance:", balance);

        if (balance > 0) {
            const verification = {
                walletAddress,
                timestamp: Date.now(),
                expiresAt: Date.now() + (CONFIG.SESSION_DURATION * 60 * 60 * 1000)
            };
            localStorage.setItem("nft_verification", JSON.stringify(verification));
            showSuccess();
        } else {
            showError("No King of Apes NFT found in your wallet.");
        }
    } catch (error) {
        console.error("NFT verification error:", error);
        showError(`Failed to verify NFT ownership: ${error.message}`);
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
    setTimeout(() => window.location.href = CONFIG.STORE_URL, 3000);
}
