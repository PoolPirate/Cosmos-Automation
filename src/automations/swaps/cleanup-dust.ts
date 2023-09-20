import {
    Chain,
    executeMultiple,
    getBalance,
    send,
    sendToOwner,
} from '../../wallet/wallet';
import Config from '../../../config.json';
import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';

export async function runCleanupDustAsync(chain: Chain) {
    if (chain != Chain.Osmosis) {
        throw 'Unsupported';
    }

    try {
        const denoms = Config.levana.markets
            .map((x) => x.denom)
            .filter((x) => x != 'uosmo');

        const instructions: ExecuteInstruction[] = [];

        for (let i = 0; i < denoms.length; i++) {
            const denom = denoms[i]!;
            const balance = await getBalance(chain, denom);

            if (balance > 0) {
                instructions.push({
                    contractAddress:
                        'osmo1fy547nr4ewfc38z73ghr6x62p7eguuupm66xwk8v8rjnjyeyxdqs6gdqx7',
                    msg: {
                        swap: {
                            input_coin: {
                                denom: denom,
                                amount: `${balance}`,
                            },
                            output_denom: 'uosmo',
                            slippage: {
                                twap: {
                                    slippage_percentage: '0.5',
                                    window_seconds: 5,
                                },
                            },
                        },
                    },
                    funds: [
                        {
                            denom: denom,
                            amount: `${balance}`,
                        },
                    ],
                });
            }
        }

        if (instructions.length > 0) {
            await executeMultiple(chain, instructions, {
                simulateAsPrimary: true,
                gasMultiplicator: 1.2,
            });

            await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const osmoBalance = (await getBalance(chain, 'uosmo')) - 10000000;

        if (osmoBalance < 0) {
            return;
        }

        await executeMultiple(
            chain,
            [
                {
                    contractAddress:
                        'osmo1fy547nr4ewfc38z73ghr6x62p7eguuupm66xwk8v8rjnjyeyxdqs6gdqx7',
                    msg: {
                        swap: {
                            input_coin: {
                                denom: 'uosmo',
                                amount: `${osmoBalance}`,
                            },
                            output_denom:
                                'ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858',
                            slippage: {
                                twap: {
                                    slippage_percentage: '0.5',
                                    window_seconds: 5,
                                },
                            },
                        },
                    },
                    funds: [
                        {
                            denom: 'uosmo',
                            amount: `${osmoBalance}`,
                        },
                    ],
                },
            ],
            {
                simulateAsPrimary: true,
                gasMultiplicator: 1.2,
            },
        );

        await new Promise((resolve) => setTimeout(resolve, 5000));
        const usdcBalance = await getBalance(
            chain,
            'ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858',
        );

        await sendToOwner(
            chain,
            'ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858',
            usdcBalance,
        );
        //}
    } catch (error) {
        console.error('Cleanup failed: ' + error);
    }
}
