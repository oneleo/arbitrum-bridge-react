import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { getL2Network, Erc20Bridger, L1ToL2MessageStatus } from "@arbitrum/sdk";
import { providers, Wallet, Contract, BigNumber } from "ethers";
import "./App.css";

const l1Erc20Address = import.meta.env.VITE_L1ERC20_ADDRESS;
const tokenAmount = BigNumber.from(1);

const walletPrivateKey = import.meta.env.VITE_DEVNET_PRIVKEY;
const l1Provider = new providers.JsonRpcProvider(import.meta.env.VITE_L1RPC);
const l2Provider = new providers.JsonRpcProvider(import.meta.env.VITE_L2RPC);

const erc20Abi = [
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 value) public returns (bool)",
  "function transferFrom(address from, address to, uint256 value) public returns (bool)",
  "function name() public view returns (string)",
  "function symbol() public view returns (string)",
  "function decimals() public view returns (uint8)",
];

function App() {
  const [count, setCount] = useState(0);

  const deposit = async () => {
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l1DappToken = new Contract(l1Erc20Address, erc20Abi, l1Provider);

    /**
     * Use l2Network to create an Arbitrum SDK Erc20Bridger instance
     * We'll use Erc20Bridger for its convenience methods around transferring token to L2
     */
    const l2Network = await getL2Network(l2Provider);
    const erc20Bridger = new Erc20Bridger(l2Network);

    /**
     * Because the token might have decimals, we update the amount to deposit taking into account those decimals
     */
    const tokenDecimals = await l1DappToken.decimals();
    const tokenDepositAmount = tokenAmount.mul(
      BigNumber.from(10).pow(tokenDecimals)
    );

    /**
     * The Standard Gateway contract will ultimately be making the token transfer call; thus, that's the contract we need to approve.
     * erc20Bridger.approveToken handles this approval
     * Arguments required are:
     * (1) l1Signer: The L1 address transferring token to L2
     * (2) erc20L1Address: L1 address of the ERC20 token to be depositted to L2
     */
    console.log("Approving:");
    const approveTx = await erc20Bridger.approveToken({
      l1Signer: l1Wallet,
      erc20L1Address: l1Erc20Address,
    });
    const approveRec = await approveTx.wait();
    console.log(
      `You successfully allowed the Arbitrum Bridge to spend DappToken ${approveRec.transactionHash}`
    );

    /**
     * Deposit DappToken to L2 using erc20Bridger. This will escrow funds in the Gateway contract on L1, and send a message to mint tokens on L2.
     * The erc20Bridge.deposit method handles computing the necessary fees for automatic-execution of retryable tickets — maxSubmission cost & l2 gas price * gas — and will automatically forward the fees to L2 as callvalue
     * Also note that since this is the first DappToken deposit onto L2, a standard Arb ERC20 contract will automatically be deployed.
     * Arguments required are:
     * (1) amount: The amount of tokens to be transferred to L2
     * (2) erc20L1Address: L1 address of the ERC20 token to be depositted to L2
     * (2) l1Signer: The L1 address transferring token to L2
     * (3) l2Provider: An l2 provider
     */
    console.log("Transferring DappToken to L2:");
    const depositTx = await erc20Bridger.deposit({
      amount: tokenDepositAmount,
      erc20L1Address: l1Erc20Address,
      l1Signer: l1Wallet,
      l2Provider: l2Provider,
    });
    console.log(
      `Deposit initiated: waiting for L2 retryable (takes 10-15 minutes; current time: ${new Date().toTimeString()}) `
    );
    const depositRec = await depositTx.wait();
    const l2Result = await depositRec.waitForL2(l2Provider);

    /**
     * The `complete` boolean tells us if the l1 to l2 message was successful
     */
    l2Result.complete
      ? console.log(
          `L2 message successful: status: ${
            L1ToL2MessageStatus[l2Result.status]
          }`
        )
      : console.log(
          `L2 message failed: status ${L1ToL2MessageStatus[l2Result.status]}`
        );
  };

  const withdraw = async () => {
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);
    const l1DappToken = new Contract(l1Erc20Address, erc20Abi, l1Provider);

    /**
     * Use l2Network to create an Arbitrum SDK Erc20Bridger instance
     * We'll use Erc20Bridger for its convenience methods around transferring token to L2 and back to L1
     */
    const l2Network = await getL2Network(l2Provider);
    const erc20Bridger = new Erc20Bridger(l2Network);

    /**
     * Because the token might have decimals, we update the amounts to deposit and withdraw taking into account those decimals
     */
    const tokenDecimals = await l1DappToken.decimals();
    const tokenWithdrawAmount = tokenAmount.mul(
      BigNumber.from(10).pow(tokenDecimals)
    );

    /**
     * ... Okay, Now we begin withdrawing DappToken from L2. To withdraw, we'll use Erc20Bridger helper method withdraw
     * withdraw will call our L2 Gateway Router to initiate a withdrawal via the Standard ERC20 gateway
     * This transaction is constructed and paid for like any other L2 transaction (it just happens to (ultimately) make a call to ArbSys.sendTxToL1)
     * Arguments required are:
     * (1) amount: The amount of tokens to be transferred to L1
     * (2) erc20L1Address: L1 address of the ERC20 token
     * (3) l2Signer: The L2 address transferring token to L1
     */
    console.log("Withdrawing:");
    const withdrawTx = await erc20Bridger.withdraw({
      amount: tokenWithdrawAmount,
      destinationAddress: l2Wallet.address,
      erc20l1Address: l1Erc20Address,
      l2Signer: l2Wallet,
    });
    const withdrawRec = await withdrawTx.wait();
    console.log(
      `Token withdrawal initiated! 🥳 ${withdrawRec.transactionHash}`
    );
  };

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <div className="card">
        <button onClick={deposit}>deposit to bridge</button>
      </div>
      <div className="card">
        <button onClick={withdraw}>withdraw from bridge</button>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
