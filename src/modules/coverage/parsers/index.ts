import { CoverageParser, CoverageParserResult } from './lcov.parser';
import { LcovParser } from './lcov.parser';
import { IstanbulJsonParser } from './istanbul.parser';
import { CoberturaParser } from './cobertura.parser';

export { CoverageParser, CoverageParserResult } from './lcov.parser';
export { LcovParser } from './lcov.parser';
export { IstanbulJsonParser } from './istanbul.parser';
export { CoberturaParser } from './cobertura.parser';

/**
 * Registry of all available coverage parsers.
 * Order matters: parsers are tried in sequence, first match wins.
 */
const PARSERS: CoverageParser[] = [
  new LcovParser(),
  new IstanbulJsonParser(),
  new CoberturaParser(),
];

/**
 * Auto-detect format and parse coverage content.
 *
 * @param content - Raw coverage report content (lcov, istanbul JSON, or cobertura XML)
 * @returns Parsed result with format identifier
 * @throws Error if no parser can handle the content
 */
export function autoDetectAndParse(content: string): CoverageParserResult & { format: string } {
  for (const parser of PARSERS) {
    if (parser.canParse(content)) {
      const result = parser.parse(content);
      const format =
        parser instanceof LcovParser
          ? 'lcov'
          : parser instanceof IstanbulJsonParser
            ? 'istanbul'
            : 'cobertura';
      return { ...result, format };
    }
  }

  throw new Error(
    'Unable to detect coverage format. Supported formats: lcov, istanbul JSON, cobertura XML',
  );
}
