import { Command } from 'commander';
import * as path from 'path';
import { generate } from './index';
import { writeFiles } from './emit';

const program = new Command();

program
  .name('sse-codegen')
  .description('Generate TypeScript SSE client from OpenAPI spec')
  .requiredOption('-i, --input <path>', 'Path to OpenAPI spec (YAML or JSON)')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .option('-b, --base-url <url>', 'Base URL override')
  .action(async (opts) => {
    try {
      const files = await generate({
        inputPath: path.resolve(opts.input),
        outputDir: path.resolve(opts.output),
        baseUrl: opts.baseUrl,
      });
      writeFiles(path.resolve(opts.output), files);
      console.log(`Generated ${Object.keys(files).length} files to ${opts.output}`);
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
