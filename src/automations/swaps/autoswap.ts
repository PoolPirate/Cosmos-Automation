import { ChainName } from '../../wallet/types';
import Config from '../../../config.json';
import {
    executeMultiple,
    getBalance,
    transactMultiple,
} from '../../wallet/wallet';
import { getSwapMessage } from '../../skip-api/skip-api';
import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';
import { SkipMessage } from '../../skip-api/types';
import { toUtf8 } from '@cosmjs/encoding';
import { prettifyDenom } from '../../main';

export async function runAutoSwapAsync(chain: ChainName) {
    console.log('Running AutoSwap');

    try {
        const msgs: SkipMessage[] = [];

        const denoms = Config.chains.find(
            (x) => x.name == chain,
        )!.autoswapDenoms;

        for (let i = 0; i < denoms.length; i++) {
            const denom = denoms[i]!;
            const balance = await getBalance(chain, denom);

            if (balance == 0) {
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
            break;
        }

        if (msgs.length == 0) {
            return;
        }

        await transactMultiple(
            chain,
            msgs.map((msg) => {
                return {
                    typeUrl: msg.msg_type_url,
                    value: {
                        sender: msg.msg.sender,
                        contract: msg.msg.contract,
                        msg: toUtf8(JSON.stringify(msg.msg.msg)),
                        funds: msg.msg.funds,
                    },
                };
            }),
            {
                simulateAsPrimary: true,
            },
        );
    } catch (error) {
        console.error('Autoswap failed: ' + error);
    }
}