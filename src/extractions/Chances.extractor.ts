import { basename } from 'path';
import { BaseExtractor } from '../classes/BaseExtractor';
import { readFile, readdir } from 'fs/promises';

interface BlockPredicate {
    condition: string;
    terms: {
        condition: string;
        entity: string;
        scores: {
            [key: string]: {
                min: number;
            };
        };
    }[];
}

export default class ChancesExtractor extends BaseExtractor {
    private readonly MINED_DIRECTORY = this.getRelativePath(
        'data/mt/functions/treasure/mined/'
    );

    public async Extract(): Promise<unknown> {
        // There are two formats. One uses predicates and one has the literal block name.

        const out = await this.ExtractFromMinedDirectory();
        this.writeOut(out);

        return this.passingData;
    }

    private async ExtractFromMinedDirectory() {
        const files = await readdir(this.MINED_DIRECTORY);
        const lookupTable = this.passingData['varToBlock'];
        let out: Record<string, Record<string, number>> = {};
        for (const file of files) {
            const variableName =
                'break_' + basename(file).replace('.mcfunction', '');
            const blockName = lookupTable[variableName];
            if (!blockName) {
                this.logger.warn(
                    `Could not find block name for ${variableName}`
                );
                continue;
            }

            out[blockName] = {};

            const fileContents = await readFile(
                this.MINED_DIRECTORY + file,
                'utf-8'
            );
            const lines = fileContents
                .split('\n')
                .filter((line) =>
                    line.includes('unless score @s mt.luck matches 1')
                );

            for (const line of lines) {
                const regex = /(\w+)_chance=\.\.(\d{1,2})/g;
                const match = regex.exec(line);

                if (!match) {
                    throw new Error(`Could not find chance in ${line}`);
                }

                const [, rarity, chance] = match;
                out[blockName][rarity] = parseInt(chance);
            }
        }

        return out;
    }
}
