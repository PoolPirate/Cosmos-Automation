import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';
import { SkipMessage } from '../../skip-api/types';
import Config from '../../../config.json';
import { getBalance, transactMultiple } from '../../wallet/wallet';
import { ChainName } from '../../wallet/types';
import { getConversionRate, getSwapMessage } from '../../skip-api/skip-api';
import { toUtf8 } from '@cosmjs/encoding';

export async function runBuyGas() {
    try {
        const msgs: SkipMessage[] = [];

        var intermediaryBalance = await getBalance(
            Config.autoswap.targetChainName as ChainName,
            Config.autoswap.targetDenom,
        );

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

            if (msg == null) {
                throw Error('Retrieving gas swap message failed!');
            }

            msgs.push(msg);
        }

        if (msgs.length == 0) {
            return;
        }

        await transactMultiple(
            Config.autoswap.targetChainName as ChainName,
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
        console.error(`Buying gas failed: ${error}`);
    }
}
