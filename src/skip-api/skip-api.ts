import Config from '../../config.json';
import { ChainName } from '../wallet/types';
import { getAddress } from '../wallet/wallet';
import { SkipChainDefinition, SkipMessage } from './types';

var chains: SkipChainDefinition[] = null!;
var chainIdToAddress: { [chainId: string]: string } = {};

export async function initializeSkip() {
    chains = await skip_loadChains();

    Config.chains.forEach((chain) => {
        const skipChain = chains.find((x) => x.chain_name == chain.name)!;
        chainIdToAddress[skipChain.chain_id] = getAddress(
            chain.name as ChainName,
        );
    });
}

export async function getSwapMessage(
    sourceChain: ChainName,
    sourceDenom: string,
    destChain: ChainName,
    destDenom: string,
    amountIn: number,
) {
    const sourceChainId = chains.find(
        (x) => x.chain_name == sourceChain,
    )!.chain_id;
    const destChainId = chains.find((x) => x.chain_name == destChain)!.chain_id;

    return await skip_getSwapMessage(
        sourceChainId,
        sourceDenom,
        destChainId,
        destDenom,
        amountIn,
    );
}

export async function getConversionRate(
    sourceChain: ChainName,
    sourceDenom: string,
    destChain: ChainName,
    destDenom: string,
) {
    const sourceChainId = chains.find(
        (x) => x.chain_name == sourceChain,
    )!.chain_id;
    const destChainId = chains.find((x) => x.chain_name == destChain)!.chain_id;

    return await skip_getSkipConversion(
        sourceChainId,
        sourceDenom,
        destChainId,
        destDenom,
    );
}

async function skip_loadChains() {
    const resp = await fetch(
        `https://api.skip.money/v1/info/chains?include_evm=false&client_id=${Config.skipApi.clientId}`,
    );

    const result = ((await resp.json()) as any).chains as SkipChainDefinition[];
    return result;
}

async function skip_getSwapMessage(
    sourceChainId: string,
    sourceAssetDenom: string,
    destChainId: string,
    destChainDenom: string,
    amountIn: number,
): Promise<SkipMessage | null> {
    const request = {
        source_asset_denom: sourceAssetDenom,
        source_asset_chain_id: sourceChainId,
        dest_asset_denom: destChainDenom,
        dest_asset_chain_id: destChainId,
        amount_in: `${amountIn}`,
        chain_ids_to_addresses: chainIdToAddress,
        slippage_tolerance_percent: '3',
        client_id: Config.skipApi.clientId,
    };

    const resp = await fetch(`https://api.skip.money/v1/fungible/msgs_direct`, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!resp.ok) {
        console.error(`Skip AIP Response: ${await resp.text()}`);
        return null;
    }

    const res = (await resp.json()).msgs as any[];

    if (res.length != 1) {
        throw Error('Unsupported Route');
    }

    return {
        msg_type_url: res[0]!.msg_type_url,
        msg: JSON.parse(res[0].msg),
    };
}

async function skip_getSkipConversion(
    sourceChainId: string,
    sourceAssetDenom: string,
    destChainId: string,
    destChainDenom: string,
) {
    const request = {
        amount_in: '100000',
        source_asset_denom: sourceAssetDenom,
        source_asset_chain_id: sourceChainId,
        dest_asset_denom: destChainDenom,
        dest_asset_chain_id: destChainId,
        cumulative_affiliate_fee_bps: '0',
        client_id: Config.skipApi.clientId,
    };

    const resp = await fetch(`https://api.skip.money/v1/fungible/route`, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!resp.ok) {
        console.error(`Skip AIP Response: ${await resp.text()}`);
        return null;
    }

    const res = parseInt((await resp.json()).amount_out) as number;
    return res / 100000;
}
