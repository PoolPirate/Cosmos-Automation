import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';
import { SkipMessage } from '../../skip-api/types';
import Config from '../../../config.json';
import { getBalance, transactMultiple } from '../../wallet/wallet';
import { ChainName } from '../../wallet/types';
import { getConversionRate, getSwapMessage } from '../../skip-api/skip-api';
import { toUtf8 } from '@cosmjs/encoding';
import { prettifyCoin, prettifyDenom } from '../../main';
import { EncodeObject } from '@cosmjs/proto-signing';

export async function runBuyGas() {
    console.log('Running Buy Gas');

    try {
        const msgs: SkipMessage[] = [];

        var intermediaryBalance = await getBalance(
            Config.autoswap.targetChainName as ChainName,
            Config.autoswap.targetDenom,
        );

        if (intermediaryBalance == 0) {
            console.log(
                `Skipping Buying Gas: ${prettifyDenom(
                    Config.autoswap.targetChainName as ChainName,
                    Config.autoswap.targetDenom,
                )} is 0!`,
            );
            return;
        }

        for (let i = 0; i < Config.chains.length; i++) {
            if (intermediaryBalance == 0) {
                break;
            }

            const chain = Config.chains[i]!;

            const balance = await getBalance(
                chain.name as ChainName,
                chain.feeCurrency,
            );

            if (balance >= chain.minBalance) {
                console.log(
                    `Skipping Buying Gas Asset: Minimum Balance reached (${prettifyCoin(
                        chain.feeCurrency,
                        balance,
                    )})`,
                );
                continue;
            }

            const conversionRate = await getConversionRate(
                Config.autoswap.targetChainName as ChainName,
                Config.autoswap.targetDenom,
                chain.name as ChainName,
                chain.feeCurrency,
            );

            if (conversionRate == null) {
                throw Error('Retrieving conversion rate failed');
            }

            const cost = Math.min(
                Math.ceil((chain.minBalance - balance) / conversionRate),
                intermediaryBalance,
            );
            intermediaryBalance -= cost;

            const msg = await getSwapMessage(
                Config.autoswap.targetChainName as ChainName,
                Config.autoswap.targetDenom,
                chain.name as ChainName,
                chain.feeCurrency,
                cost,
            );

            console.log(
                `Buying gas: ${prettifyCoin(
                    Config.autoswap.targetDenom,
                    cost,
                )} swapped for ${prettifyCoin(
                    chain.feeCurrency,
                    chain.minBalance - balance,
                )}`,
            );

            if (msg == null) {
                throw Error('Retrieving gas swap message failed!');
            }

            msgs.push(msg);
        }

        if (msgs.length == 0) {
            return;
        }

        executeBuyGas(Config.autoswap.targetChainName as ChainName, msgs);
    } catch (error) {
        console.error(`Buying gas failed: ${error}`);
    }
}

async function executeBuyGas(chain: ChainName, msgs: SkipMessage[]) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await executeBuyGasAttempt(
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
            );
            console.log(`Buy gas success (${chain})`);
            break;
        } catch (error) {
            console.log(`Buy gas failed (${chain}): ${error}`);
        }
    }
}

async function executeBuyGasAttempt(chain: ChainName, msgs: EncodeObject[]) {
    await transactMultiple(chain, msgs, {
        simulateAsPrimary: true,
    });
}
