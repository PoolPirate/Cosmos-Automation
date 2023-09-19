import { runLevanaClaim } from './automations/levana/levana-claim';
import { runLevanaCrank } from './automations/levana/levana-crank';
import { Chain, initializeWallet, refreshPeakHeights } from './wallet/wallet';

main()
    .then(() => {})
    .catch((e) => console.error('APP CRASH! ' + e));

var lastCrankRun: Date;

async function main() {
    await initializeWallet();

    setTimeout(refreshPeakHeights, 1000); //Self refreshing

    setInterval(runLevanaClaim, 1000 * 60 * 60 * 2);

    await runLevanaClaim(Chain.Osmosis);

    await sleepInfinite();
}

export async function handleNewBlock(
    chain: Chain,
    height: number,
    timestamp: Date,
) {
    const processingStartTimeMs = new Date().getTime();
    const blockDelay = processingStartTimeMs - timestamp.getTime();

    console.log(`${chain} - ${height} (${blockDelay}ms late)`);

    await runLevanaCrank(chain, processingStartTimeMs);
    lastCrankRun = new Date();
}

async function sleepInfinite() {
    await new Promise(() => {});
}
