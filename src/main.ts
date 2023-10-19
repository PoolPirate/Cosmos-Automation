import { runLevanaClaim } from './automations/levana/levana-claim';
import { runLevanaCrank } from './automations/levana/levana-crank';
import { initializeWallet, refreshPeakHeights } from './wallet/wallet';
import { ChainName } from './wallet/types';
import { runAutoSwapAsync } from './automations/swaps/autoswap';
import { initializeSkip } from './skip-api/skip-api';
import { runBuyGas } from './automations/swaps/buy-gas';
import { runFlushAsync } from './automations/swaps/flush';
import Config from '../config.json';

main()
    .then(() => {})
    .catch((e) => console.error('APP CRASH! ' + e));

const executionDurations: Map<ChainName, number[]> = new Map<
    ChainName,
    number[]
>();

async function main() {
    Config.chains.forEach((chain) => {
        executionDurations.set(chain.name as ChainName, []);
    });

    await initializeWallet();
    await initializeSkip();

    await runAssetShifting();

    setInterval(reportExecutionDurations, 300000);

    setTimeout(refreshPeakHeights, 1000); //Self refreshing
    setInterval(runAssetShifting, 1000 * 60 * 60 * 12);

    await sleepInfinite();
}

async function runAssetShifting() {
    try {
        await runLevanaClaim(ChainName.Osmosis);
        await runLevanaClaim(ChainName.Injective);
        await new Promise((resolve) => setTimeout(resolve, 20000));
        await runAutoSwapAsync(ChainName.Osmosis);
        await runAutoSwapAsync(ChainName.Injective);
        await new Promise((resolve) => setTimeout(resolve, 50000));
        await runBuyGas();
        await new Promise((resolve) => setTimeout(resolve, 20000));
        await runFlushAsync();
    } catch (error) {
        console.log(`Asset shit failed: ${error}. Rescheduling in 5 minutes`);
        setTimeout(runAssetShifting, 5 * 60 * 1000);
    }
}

export async function handleNewBlock(chain: ChainName) {
    const processingStartTimeMs = new Date().getTime();

    await runLevanaCrank(chain, processingStartTimeMs);
    executionDurations
        .get(chain)!
        .push(new Date().getTime() - processingStartTimeMs);
}

function reportExecutionDurations() {
    let s = '';

    Config.chains.forEach((chain) => {
        s += `\n${chain.name} - avg ${Math.round(
            executionDurations
                .get(chain.name as ChainName)!
                .reduce((prev, curr, _, arr) => prev + curr / arr.length, 0),
        )} ms`;
        executionDurations.set(chain.name as ChainName, []);
    });

    console.log('Average Block Handler Execution Times:' + s);
}

async function sleepInfinite() {
    await new Promise(() => {});
}

export function prettifyCoin(denom: string, amount: number) {
    const tokenLabel = Config.labels.find((x) => x.denom == denom);

    if (tokenLabel == null) {
        return `${amount} ${denom}`;
    }

    return `${
        Math.round(
            (Math.pow(10, tokenLabel.decimals / 4) * amount) /
                Math.pow(10, tokenLabel.decimals),
        ) / Math.pow(10, tokenLabel.decimals / 4)
    } ${tokenLabel.symbol}`;
}

export function prettifyDenom(chain: ChainName, denom: string) {
    const tokenLabel = Config.labels.find((x) => x.denom == denom);

    if (tokenLabel == null) {
        return `${denom}`;
    }

    return `${tokenLabel.symbol} (${chain})`;
}
