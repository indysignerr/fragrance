/**
 * Découpage d'une saisie libre en lignes exploitables.
 *
 * Hors du module serveur : fonction pure, testable sans réseau.
 */
export function splitInput(input: string): string[] {
  return input
    .split(/[\n;]+/)
    .flatMap((line) => (line.split(',').length > 1 ? line.split(',') : [line]))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}
