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

var lastCrankRun: Date;

async function main() {
    await initializeWallet();
    await initializeSkip();

    setTimeout(refreshPeakHeights, 1000); //Self refreshing
    setInterval(runAssetShifting, 1000 * 60 * 60 * 24);

    await runAssetShifting();
    await sleepInfinite();
}

async function runAssetShifting() {
    await runLevanaClaim(ChainName.Osmosis);
    await runLevanaClaim(ChainName.Injective);
    await runAutoSwapAsync(ChainName.Osmosis);
    await runAutoSwapAsync(ChainName.Injective);
    await runBuyGas();
    await runFlushAsync();
}

export async function handleNewBlock(chain: ChainName) {
    const processingStartTimeMs = new Date().getTime();

    await runLevanaCrank(chain, processingStartTimeMs);
    lastCrankRun = new Date();
}

async function sleepInfinite() {
    await new Promise(() => {});
}

export function prettifyCoin(denom: string, amount: number) {
    const tokenLabel = Config.labels.find((x) => x.denom == denom);

    if (tokenLabel == null) {
        return `${amount} ${denom}`;
    }

    return `${Math.round(
        (1000 * amount) / Math.pow(10, tokenLabel.decimals) / 1000,
    )} ${tokenLabel.symbol}`;
}

export function prettifyDenom(chain: ChainName, denom: string) {
    const tokenLabel = Config.labels.find((x) => x.denom == denom);

    if (tokenLabel == null) {
        return `${denom}`;
    }

    return `${tokenLabel.symbol} (${chain})`;
}
