import { readFile } from 'fs/promises';
import { BaseExtractor } from '../classes/BaseExtractor';

export default class VariableBlockMapExtractor extends BaseExtractor {
    private readonly INIT_FILE = this.getRelativePath(
        'data/mt/functions/init.mcfunction'
    );
    public priority = 100; // definitely needs to run first as other data depends on this map

    public async Extract(): Promise<unknown> {
        this.passingData['mineable_blocks'] = [];
        this.passingData['varToBlock'] = {};

        const blockVariableRegex =
            /scoreboard objectives add mt\.(.+) minecraft\.mined:(.+)/g;
        const stoneCheckFile_contents = await readFile(this.INIT_FILE, 'utf-8');

        let m;
        while (
            (m = blockVariableRegex.exec(stoneCheckFile_contents)) !== null
        ) {
            if (m.index === blockVariableRegex.lastIndex) {
                blockVariableRegex.lastIndex++;
            }

            const block = m[2].replace('minecraft.', '');
            this.passingData['varToBlock'][m[1]] = block;
            if (!this.passingData['mineable_blocks'].includes(block))
                this.passingData['mineable_blocks'].push(block);
        }

        this.logger.info(
            `Found ${this.passingData['mineable_blocks'].length} mineable blocks`
        );
        this.logger.info(
            `Found ${
                Object.keys(this.passingData['varToBlock']).length
            } block variables`
        );

        this.writeOut(this.passingData['mineable_blocks'], 'blocks.json');
        return this.passingData;
    }
}
