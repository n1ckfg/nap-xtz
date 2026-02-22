"use strict";

// ─── Configuration ────────────────────────────────────────────────────────────
// After deploying fa2-naplps.mligo to Ghostnet, paste the resulting KT1 address here.
const CONTRACT_ADDRESS = "KT1NjXnehzE7RRREsZ3UuWorJY75anjeWnjJ";

const TZKT_BASE    = "https://api.ghostnet.tzkt.io/v1";
const GHOSTNET_RPC = "https://rpc.ghostnet.teztnets.com";

// ─── State ────────────────────────────────────────────────────────────────────
let _beaconClient  = null;
let _activeAccount = null;

// ─── Byte helpers ─────────────────────────────────────────────────────────────
// Encode a NAPLPS binary string to lowercase hex for on-chain storage.
function stringToHex(str) {
    let hex = "";
    for (let i = 0; i < str.length; i++) {
        hex += str.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
}

// Decode hex bytes from on-chain storage back to a NAPLPS binary string.
function hexToString(hex) {
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function setStatus(msg, isError) {
    const el = document.getElementById("tezos-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#ff6666" : "#ffcc00";
}

function updateWalletUI() {
    const btnConnect    = document.getElementById("btn-connect");
    const btnDisconnect = document.getElementById("btn-disconnect");
    const addrEl        = document.getElementById("tezos-address");

    if (_activeAccount) {
        if (btnConnect)    btnConnect.style.display    = "none";
        if (btnDisconnect) btnDisconnect.style.display = "inline-block";
        if (addrEl) {
            const addr = _activeAccount.address;
            addrEl.textContent = addr.slice(0, 6) + "…" + addr.slice(-4);
            addrEl.title = addr;
        }
    } else {
        if (btnConnect)    btnConnect.style.display    = "inline-block";
        if (btnDisconnect) btnDisconnect.style.display = "none";
        if (addrEl) addrEl.textContent = "";
    }
}

// ─── Initialization ───────────────────────────────────────────────────────────
async function initTezos() {
    try {
        // Support multiple possible UMD global names for the Beacon SDK bundle.
        const SDK = window.BeaconDapp || window.beaconDapp || window.beacon;
        if (!SDK || !SDK.DAppClient) {
            console.warn("Beacon SDK not detected — wallet features disabled.");
            setStatus("Wallet SDK unavailable", true);
            return;
        }

        // Beacon SDK v4+: network must be declared at construction time.
        const networkType = (SDK.NetworkType && SDK.NetworkType.GHOSTNET) || "ghostnet";
        _beaconClient = new SDK.DAppClient({
            name: "NAP-XTZ",
            network: { type: networkType }
        });

        // Restore an existing wallet session on page load.
        const existing = await _beaconClient.getActiveAccount();
        if (existing) {
            _activeAccount = existing;
            updateWalletUI();
        }

        // Try to load the latest on-chain token and render it.
        await loadLatestToken();

    } catch (e) {
        console.error("initTezos:", e);
        setStatus("Tezos init error: " + e.message, true);
    }
}

// ─── Wallet connection ────────────────────────────────────────────────────────
async function connectWallet() {
    if (!_beaconClient) { setStatus("SDK not ready", true); return; }
    try {
        setStatus("Opening wallet…");
        // Network was set at DAppClient construction — do not pass it here.
        await _beaconClient.requestPermissions();
        _activeAccount = await _beaconClient.getActiveAccount();
        updateWalletUI();
        setStatus("Wallet connected");

        // Show Mint button if there is pending NAPLPS data.
        if (window.pendingNapRaw) {
            const btn = document.getElementById("btn-mint");
            if (btn) btn.style.display = "inline-block";
        }
    } catch (e) {
        console.error("connectWallet:", e);
        setStatus("Connect failed: " + e.message, true);
    }
}

async function disconnectWallet() {
    if (!_beaconClient) return;
    try {
        await _beaconClient.clearActiveAccount();
        _activeAccount = null;
        updateWalletUI();
        setStatus("Disconnected");
        const btnMint = document.getElementById("btn-mint");
        if (btnMint) btnMint.style.display = "none";
    } catch (e) {
        console.error("disconnectWallet:", e);
    }
}

// ─── Minting ──────────────────────────────────────────────────────────────────
async function mintCurrentNaplps() {
    if (!_beaconClient || !_activeAccount) {
        setStatus("Connect wallet first", true);
        return;
    }
    const napRaw = window.pendingNapRaw;
    if (!napRaw) {
        setStatus("No NAPLPS data — drop an SVG first", true);
        return;
    }
    if (CONTRACT_ADDRESS === "KT1PLACEHOLDER") {
        setStatus("Contract not deployed — set CONTRACT_ADDRESS in tezos.js", true);
        return;
    }
    try {
        setStatus("Sending mint transaction…");
        await mintNaplpsToken(napRaw);
        setStatus("Transaction sent — waiting for confirmation…");
        // Poll after ~30 s to let the block confirm and TzKT index it.
        setTimeout(async () => {
            await loadLatestToken();
        }, 30000);
    } catch (e) {
        console.error("mintCurrentNaplps:", e);
        setStatus("Mint failed: " + e.message, true);
    }
}

async function mintNaplpsToken(napRaw) {
    const ownerAddress = _activeAccount.address;
    const hexBytes     = stringToHex(napRaw);

    // Michelson JSON for the "mint" entrypoint parameter.
    // LIGO sorts record fields alphabetically, so the compiled type is:
    //   mint (pair (map %metadata string bytes) (address %to_))
    // i.e. metadata first, to_ second.
    const mintValue = {
        prim: "Pair",
        args: [
            [
                {
                    prim: "Elt",
                    args: [
                        { string: "naplps" },
                        { bytes: hexBytes }
                    ]
                }
            ],
            { string: ownerAddress }
        ]
    };

    return await _beaconClient.requestOperation({
        operationDetails: [
            {
                kind: "transaction",
                destination: CONTRACT_ADDRESS,
                amount: "0",
                parameters: {
                    entrypoint: "mint",
                    value: mintValue
                }
            }
        ]
    });
}

// ─── Reading from chain ───────────────────────────────────────────────────────
async function loadLatestToken() {
    if (CONTRACT_ADDRESS === "KT1PLACEHOLDER") {
        // No contract yet — nothing to load.
        return;
    }
    try {
        setStatus("Loading latest token from chain…");
        const napRaw = await readLatestNaplps();
        if (napRaw) {
            // Delegate to the existing p5.js renderer in index.html.
            loadTelidonFromText(napRaw);
            setStatus("Latest token loaded from chain");
        } else {
            setStatus("No tokens on chain yet");
        }
    } catch (e) {
        console.warn("loadLatestToken:", e);
        setStatus("Chain read failed — using local samples");
    }
}

async function readLatestNaplps() {
    // 1. Fetch storage to discover next_token_id.
    const storageResp = await fetch(
        `${TZKT_BASE}/contracts/${CONTRACT_ADDRESS}/storage`
    );
    if (!storageResp.ok) {
        throw new Error("Storage fetch failed: " + storageResp.status);
    }
    const storage = await storageResp.json();

    const nextId = parseInt(storage.next_token_id || "0", 10);
    if (isNaN(nextId) || nextId === 0) return null;

    const latestId = nextId - 1;

    // 2. Fetch the token_metadata bigmap entry for the latest token.
    const keyResp = await fetch(
        `${TZKT_BASE}/contracts/${CONTRACT_ADDRESS}/bigmaps/token_metadata/keys/${latestId}`
    );
    if (!keyResp.ok) {
        throw new Error("Bigmap key fetch failed: " + keyResp.status);
    }
    const entry = await keyResp.json();

    // TzKT decodes `bytes` values as lowercase hex strings.
    const hexNaplps = entry?.value?.token_info?.naplps;
    if (!hexNaplps) return null;

    return hexToString(hexNaplps);
}
