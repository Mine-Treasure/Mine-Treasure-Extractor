import { join, basename } from 'path';
import { writeFile } from 'fs/promises';
import { Extractor } from './Extractor';
import Logger from './Logger';
import chalk from 'chalk';

export abstract class BaseExtractor {
    public outFile: string;
    public outDir: string;
    public rootDir: string;
    public passingData: any;

    public priority = 0;
    public extractor: Extractor;
    public logger: Logger = new Logger();

    constructor(
        outFile: string,
        rootDir: string,
        outDir: string,
        passingData: any,
        extractor: Extractor
    ) {
        this.outDir = outDir;
        this.rootDir = rootDir;
        this.outFile = outFile;
        this.passingData = passingData;
        this.extractor = extractor;

        this.logger.prefix = chalk.bold.magenta(
            basename(this.constructor.name).replace('Extractor', '')
        );
    }

    public getRelativePath(path: string): string {
        return join(this.rootDir, path);
    }

    public async writeOut(
        json: any,
        fileName: string = `${this.outFile}.json`
    ) {
        writeFile(join(this.outDir, fileName), JSON.stringify(json, null, 4));
    }

    public abstract Extract(): Promise<unknown>;
}
