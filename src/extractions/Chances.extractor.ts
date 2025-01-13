import { basename, join } from 'path';
import { BaseExtractor } from '../classes/BaseExtractor';
import { readFile, readdir } from 'fs/promises';
import { readdirSync, readFileSync } from 'fs';

interface BlockChance {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
    mythical: number;
}

export default class ChancesExtractor extends BaseExtractor {
    private readonly BLOCKS_DIRECTORY = this.getRelativePath(
        'data/minecraft/loot_table/blocks/'
    );

    public async Extract(): Promise<unknown> {
        // There are two formats. One uses predicates and one has the literal block name.
        const out: Record<string, BlockChance> = {};

        const files = readdirSync(this.BLOCKS_DIRECTORY);
        for (const file of files) {
            const content = readFileSync(
                join(this.BLOCKS_DIRECTORY, file),
                'utf-8'
            );
            const json = JSON.parse(content);

            const blockChanceTier = json.pools[0].entries[0].value;
            if (!blockChanceTier) {
                this.logger.error(
                    `No block chance tier found for ${file}. Skipping`
                );
                continue;
            }

            const pathInDatapack = this.getRelativePath(
                `data/mt/loot_table/${blockChanceTier.replace('mt:', '')}.json`
            );

            const settingsFile = readFileSync(pathInDatapack, 'utf-8');
            const settings = JSON.parse(settingsFile);

            const sections = settings.pools[0].entries;

            for (const section of sections) {
                let rarity = section.value.split('/')[2];
                if (rarity === 'roll') {
                    rarity = 'mythical';
                }

                const chance = section.conditions.find(
                    (c: any) => c.condition === 'minecraft:random_chance'
                ).chance.scale as number;

                const block = file.replace('.json', '');
                if (!out[block])
                    out[block] = {
                        common: 0,
                        rare: 0,
                        epic: 0,
                        legendary: 0,
                        mythical: 0,
                    };

                // @ts-ignore
                out[block][rarity] = chance;
            }
        }

        this.writeOut(out, 'chances.json');

        return this.passingData;
    }
}
