import MevShareClient, {IPendingTransaction} from '@flashbots/mev-share-client' //Listen for new pending tx
import { Contract, JsonRpcProvider, Wallet } from 'ethers' //Create and sign our tx, query blockchain
import { UNISWAP_V2_ABI, UNISWAP_FACTORY_ABI, ERC20_ABI } from './abi'
import * as dotenv from "dotenv"
dotenv.config();

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const EXECUTOR_KEY = process.env.EXECUTOR_KEY || Wallet.createRandom().privateKey
const FB_REPUTATION_PRIVATE_KEY = process.env.FB_REPUTATION_PRIVATE_KEY || Wallet.createRandom().privateKey //Setting default values with || operator

//create web3 provider and wallets, connect to mev-share
const provider = new JsonRpcProvider(RPC_URL)
const executorWallet = new Wallet(EXECUTOR_KEY, provider)
const authSigner = new Wallet(FB_REPUTATION_PRIVATE_KEY, provider)
const mevshare = MevShareClient.useEthereumSepolia(authSigner) //.useEthereumMainnet(authSigner)

//create contract instances
const UNISWAP_V2_ADDRESS = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
const UNISWAP_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
const uniswapRouterContract = new Contract(UNISWAP_V2_ADDRESS, UNISWAP_V2_ABI, executorWallet)
const uniswapFactoryContract = new Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, provider)

//useful constants for later
//discount we expect from the backrun trade in basis pts
const DISCOUNT_IN_BPS = 40n
//try sending a backrun bundle for this many blocks:
const BLOCKS_TO_TRY = 24
//WETH:
const SELL_TOKEN_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const SELL_TOKEN_AMOUNT = 100000000n
//numeraire stablecoin DAI:
const BUY_TOKEN_ADDRESS = '0x6b175474e89094c44da98b954eedeac495271d0f'
const BUY_TOKEN_AMOUNT_CUTOFF = SELL_TOKEN_AMOUNT * 3800n //buy when token price is 3800 DAI/WETH

const TX_GAS_LIMIT = 400000
const MAX_GAS_PRICE = 20n
const MAX_PRIORITY_FEE = 5n
const GWEI = 10n ** 9n

async function main() {
    console.log("mev-share auth address: " + authSigner.address)
    console.log("executor address: " +  executorWallet.address)

    //bot only executes one trade, get the nonce now
    const nonce = await executorWallet.getNonce("latest")

    mevshare.on('transaction', async ( pendingTx: IPendingTransaction) => {
        console.log(pendingTx)
    })
}
main()