import chalk from "chalk";
import { readdir } from "fs/promises";
import { join } from "path";
import Logger from "./Logger.js";

export class Extractor {

    private extractionsDir: string;
    private packDir: string;
    private outDir: string;
    private logger = new Logger();

    constructor(extractionsDir: string, packDir: string, outDir: string) {
        this.extractionsDir = extractionsDir;
        this.packDir = packDir;
        this.outDir = outDir;
        this.logger.prefix = chalk.bold.yellow("EXTRACTOR");
    }

    public async start() {
        const files = await readdir(this.extractionsDir);
        const extractors = [];

        let passingData = {};
        for (const file of files) {
            const extractor = require(join(this.extractionsDir, file));
            const instance = new extractor.default(file.split(".")[0], this.packDir, this.outDir, passingData);
            extractors.push({ file: file, instance });
        }

        extractors.sort((a, b) => b.instance.priority - a.instance.priority);
        for (const { file, instance } of extractors) {
            const started = Date.now()
            passingData = await instance.Extract();
            const ended = Date.now();

            this.logger.info(chalk.bold.green(""), chalk.bold.blueBright(file), "extracted in", chalk.bold.rgb(255, 127, 0)((ended - started) + "ms"))
        }
    }
}