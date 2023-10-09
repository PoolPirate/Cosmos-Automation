import { ChainName } from '../../wallet/types';
import Config from '../../../config.json';
import { getBalance, transactMultiple } from '../../wallet/wallet';
import { getSwapMessage } from '../../skip-api/skip-api';
import { SkipMessage } from '../../skip-api/types';
import { toUtf8 } from '@cosmjs/encoding';
import { prettifyDenom } from '../../main';
import { EncodeObject } from '@cosmjs/proto-signing';
import { MsgIBCSend } from '@injectivelabs/core-proto-ts/cjs/cosmwasm/wasm/v1/ibc';
import { MsgExecuteContract } from '@injectivelabs/core-proto-ts/cjs/cosmwasm/wasm/v1/tx';
import { MsgTransfer } from '@injectivelabs/core-proto-ts/cjs/ibc/applications/transfer/v1/tx';

export async function runAutoSwapAsync(chain: ChainName) {
    console.log('Running AutoSwap');

    try {
        const msgs: SkipMessage[] = [];
        const chainInfo = Config.chains.find((x) => x.name == chain)!;
        const denoms = chainInfo.autoswapDenoms;

        for (let i = 0; i < denoms.length; i++) {
            const denom = denoms[i]!;

            const balance =
                chainInfo.feeCurrency == denom
                    ? (await getBalance(chain, denom)) -
                      chainInfo.minBalance * 1.01
                    : await getBalance(chain, denom);

            if (balance <= 0) {
                console.log(
                    `Skip swapping asset: ${prettifyDenom(
                        chain,
                        denom,
                    )}. Balance is 0!`,
                );
                continue;
            }

            const swapMessage = await getSwapMessage(
                chain,
                denom,
                Config.autoswap.targetChainName as ChainName,
                Config.autoswap.targetDenom,
                balance,
            );

            if (swapMessage == null) {
                console.log(
                    `Skip swapping asset: ${denom}. Swap message could not be retrieved!`,
                );
                continue;
            }

            msgs.push(swapMessage);
        }

        const txMsgs: EncodeObject[] = [];
        msgs.forEach((msg) => {
            if (msg.msg_type_url.includes('MsgExecuteContract')) {
                txMsgs.push({
                    typeUrl: msg.msg_type_url,
                    value: MsgExecuteContract.fromPartial({
                        sender: msg.msg.sender,
                        contract: msg.msg.contract,
                        msg: toUtf8(JSON.stringify(msg.msg.msg)),
                        funds: msg.msg.funds,
                    }),
                });
            } else if (msg.msg_type_url.includes('MsgTransfer')) {
                txMsgs.push({
                    typeUrl: msg.msg_type_url,
                    value: MsgTransfer.fromPartial({
                        memo: msg.msg.memo,
                        receiver: msg.msg.receiver,
                        sender: msg.msg.sender,
                        sourceChannel: msg.msg.source_channel,
                        sourcePort: msg.msg.source_port,
                        timeoutHeight: msg.msg.timeout_height,
                        timeoutTimestamp: msg.msg.timeout_timestamp,
                        token: msg.msg.token,
                    }),
                });
            } else {
                console.error(`Unmapped tx type: ${msg.msg_type_url}`);
            }
        });

        if (txMsgs.length == 0) {
            return;
        }

        await transactMultiple(chain, txMsgs, {
            simulateAsPrimary: true,
            gasBuffer: 40000,
        });
    } catch (error) {
        console.error('Autoswap failed: ' + error);
    }
}

async function executeAutoswap(chain: ChainName, txMsgs: EncodeObject[]) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await executeAutoswapAttempt(chain, txMsgs);
            console.log(`Autoswap success (${chain})`);
            break;
        } catch (error) {
            console.error(`Autoswap tx failed (${chain}): ${error}`);
        }
    }
}

async function executeAutoswapAttempt(
    chain: ChainName,
    txMsgs: EncodeObject[],
) {
    await transactMultiple(chain, txMsgs, {
        simulateAsPrimary: true,
        gasBuffer: 40000,
    });
}
