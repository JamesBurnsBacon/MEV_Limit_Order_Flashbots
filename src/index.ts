import MevShareClient, {IPendingTransaction} from '@flashbots/mev-share-client' //Listen for new pending tx
import { Contract, JsonRpcProvider, Wallet } from 'ethers' //Create and sign our tx, query blockchain
import { UNISWAP_V2_ABI, UNISWAP_FACTORY_ABI, ERC20_ABI } from './abi'
import * as dotenv from "dotenv"
dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://rpc.ankr.com/eth' //'https://rpc.ankr.com/eth_sepolia' //ankr.com
const EXECUTOR_KEY = process.env.EXECUTOR_KEY || Wallet.createRandom().privateKey
const FB_REPUTATION_PRIVATE_KEY = process.env.FB_REPUTATION_PRIVATE_KEY || Wallet.createRandom().privateKey //Setting default values with || operator

//create web3 provider and wallets, connect to mev-share
const provider = new JsonRpcProvider(RPC_URL)
const executorWallet = new Wallet(EXECUTOR_KEY, provider)
const authSigner = new Wallet(FB_REPUTATION_PRIVATE_KEY, provider)
const mevshare = MevShareClient.useEthereumSepolia(authSigner) //test
//const mevshare = MevShareClient.useEthereumMainnet(authSigner) //main

//create contract instances
const UNISWAP_V2_ADDRESS = '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3'
const UNISWAP_FACTORY_ADDRESS = '0xF62c03E08ada871A0bEb309762E260a7a6a880E6'
const uniswapRouterContract = new Contract(UNISWAP_V2_ADDRESS, UNISWAP_V2_ABI, executorWallet) //to execute trades
const uniswapFactoryContract = new Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, provider) //to find contract addr of pair we want to trade

//useful constants for later
//discount we expect from the backrun trade in basis pts
const DISCOUNT_IN_BPS = 40n
//try sending a backrun bundle for this many blocks:
const BLOCKS_TO_TRY = 24
//WETH:
const SELL_TOKEN_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' //token we want to sell
const SELL_TOKEN_AMOUNT = 100000000n //.1gwei to spend
//numeraire stablecoin USDC:
const BUY_TOKEN_ADDRESS = '0xf08A50178dfcDe18524640EA6618a1f965821715'
const BUY_TOKEN_AMOUNT_CUTOFF = SELL_TOKEN_AMOUNT * 3800n //buy when token price is 3800 USDC/WETH

const TX_GAS_LIMIT = 400000
const MAX_GAS_PRICE = 20n //can use getFeeData from Ethers can provide live numbers here
const MAX_PRIORITY_FEE = 5n
const GWEI = 10n ** 9n

function transactionIsRelatedToPair(pendingTx: IPendingTransaction, PAIR_ADDRESS: string) {
    return pendingTx.to == PAIR_ADDRESS ||
        ((pendingTx.logs || []).some(log => log.address === PAIR_ADDRESS))
}

async function approveTokenToRouter( tokenAddress: string, routerAddress: string) { //approve router to spend WETH
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, executorWallet)
    const allowance = await tokenContract.allowance(executorWallet.address, routerAddress)
    const balance = await tokenContract.balanceOf(executorWallet.address)
    if (balance == 0n) {
        console.error("No token balance for " + tokenAddress)
        process.exit(1)
    }
    if (allowance >= balance) {
        console.log("token already approved")
        return
    }
    await tokenContract.approve(routerAddress, 2n**256n - 1n)
}

async function main() {
    console.log("mev-share auth address: " + authSigner.address)
    console.log("executor address: " +  executorWallet.address)
    //approve router to trade WETH
    const PAIR_ADDRESS = (await uniswapFactoryContract.getPair(
        SELL_TOKEN_ADDRESS,
        BUY_TOKEN_ADDRESS
    )).toLowerCase()
    await approveTokenToRouter(SELL_TOKEN_ADDRESS, UNISWAP_V2_ADDRESS)
    //bot only executes one trade, get the nonce now
    const nonce = await executorWallet.getNonce("latest")

    mevshare.on('transaction', async ( pendingTx: IPendingTransaction) => {
        if (!transactionIsRelatedToPair(pendingTx, PAIR_ADDRESS)) {
            console.log('skipping tx: ' + pendingTx.hash)
            return
        }
        console.log(`It's a match: ${ pendingTx.hash }`)
    })
}
main()