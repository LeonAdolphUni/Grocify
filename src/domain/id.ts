/**
 * IDs für neu angelegte Objekte.
 *
 * Zeitstempel plus Zufall: ausreichend eindeutig für eine Anwendung mit
 * einem Nutzer, ohne eine UUID-Bibliothek dafür einzubinden. Der
 * Zeitanteil sorgt nebenbei dafür, dass IDs grob in Entstehungsreihenfolge
 * sortieren.
 */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
