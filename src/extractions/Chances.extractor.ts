import { BaseExtractor } from '../classes/BaseExtractor';
import { readFile } from 'fs/promises';

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
    private readonly STONE_CHECK_FILE = this.getRelativePath(
        'data/mt/functions/treasure/tiers/stone_check_'
    );
    private readonly CHANCES = ['common', 'rare', 'epic', 'legendary'];
    private readonly PREDICATE_BASE_DIR = this.getRelativePath(
        'data/mt/predicates/'
    );

    public async Extract(): Promise<unknown> {
        // There are two formats. One uses predicates and one has the literal block name.

        const out1 = await this.ExtractShortMethod();
        const out2 = await this.ExtractLongMethod();
        this.writeOut({ ...out1, ...out2 });

        return this.passingData;
    }

    private async ExtractShortMethod() {
        const regex =
            /execute if entity @s\[scores={mt\.(.+)_chance=\.\.(\d+),mt\.break_(.+)=1\.\.}.*?]/gm;
        const lookupTable = this.passingData['varToBlock'];

        let out: Record<string, Record<string, number>> = {};

        for (const rarity of this.CHANCES) {
            const stoneCheckFile_contents = await readFile(
                this.STONE_CHECK_FILE + rarity + '.mcfunction',
                'utf-8'
            );
            let m;

            while ((m = regex.exec(stoneCheckFile_contents)) !== null) {
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                const category = m[1];
                const chance = parseInt(m[2]);
                let block = m[3];

                const mcBlock = lookupTable[block];
                if (!out[mcBlock]) {
                    out[mcBlock] = {};
                }

                out[mcBlock][category] = chance;
            }
        }

        return out;
    }

    private async ExtractLongMethod() {
        const regex =
            /execute if entity @s\[scores={mt\.(.+)_chance=\.\.(\d+)}(?:,predicate=!?mt:([a-zA-Z/]*))(?:,predicate=!?mt:[a-zA-Z/]*)?\]/gm;
        const lookupTable = this.passingData['varToBlock'];

        let out: Record<string, Record<string, number>> = {};

        for (const rarity of this.CHANCES) {
            const stoneCheckFile_contents = await readFile(
                this.STONE_CHECK_FILE + rarity + '.mcfunction',
                'utf-8'
            );
            let m;

            while ((m = regex.exec(stoneCheckFile_contents)) !== null) {
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                const category = m[1];
                const chance = parseInt(m[2]);
                let predicateFile = m[3];

                // Search the predicate json file and extract the variable names to match them to the blocks.
                const json = await readFile(
                    this.PREDICATE_BASE_DIR + predicateFile + '.json',
                    'utf-8'
                );
                const predicate = JSON.parse(json) as BlockPredicate[];
                predicate[0].terms.forEach((term) => {
                    const variable = Object.keys(term.scores)[0].replace(
                        'mt.',
                        ''
                    );
                    const mcBlock = lookupTable[variable];
                    if (!out[mcBlock]) {
                        out[mcBlock] = {};
                    }
                    out[mcBlock][category] = chance;
                });
            }
        }

        return out;
    }
}
