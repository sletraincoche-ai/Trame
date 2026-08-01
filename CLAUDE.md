# Trame — instructions de projet

Ce fichier est lu par Claude Code au début de chaque session. Il fait autorité sur toute préférence contraire exprimée dans une session isolée : si une décision d'ici doit changer, on la change ici, pas seulement dans une conversation.

## Ce qu'est Trame

Un outil qui transforme un fichier professionnel (Excel, CSV, PDF) en livrable structuré, en posant les questions de clarification qu'un analyste poserait avant d'agir — jamais en devinant à la place de l'utilisateur. Référence complète : `docs/ARCHITECTURE.md` (document d'architecture livré, 11 sections).

## Règle d'architecture non négociable

**Toute décision qui demande du jugement passe par une interface, jamais par du code appelant directement un modèle.**

```ts
type ScopeResult =
  | { scope: "file_transformation" }
  | { scope: "conversational" }
  | { scope: "out_of_scope" }

interface ClarificationEngine {
  isInScope(message: string): Promise<ScopeResult>
  proposeQuestions(profile: FileProfile): Promise<Question[]>
  generateFormula(intent: string, columns: ColumnSpec[]): Promise<Formula>
}
```

Deux implémentations obligatoires, testées contre le même jeu de contrats (`packages/engine/src/contract-tests/`) :
- `RuleBasedEngine` — déterministe, aucune dépendance externe, utilisée jusqu'à la phase M3.
- `ClaudeEngine` — branchée en phase M3, doit passer les mêmes tests de contrat que `RuleBasedEngine` avant d'être activée par défaut.

Ne jamais faire d'appel à l'API Claude en dehors de `packages/engine/src/claude/`. Si un composant frontend ou une route API a besoin d'une décision de jugement, il appelle l'interface `ClarificationEngine`, jamais directement un SDK.

## Ce qui est réel dès aujourd'hui (pas de simulation)

- Lecture de fichiers `.xlsx`/`.csv` réels via `exceljs` — jamais de données de démonstration codées en dur au-delà de `apps/web/fixtures/`.
- Calcul des tableaux croisés, écarts et contrôles qualité : arithmétique pure, dans `packages/core/`, sans IA.
- Génération du classeur `.xlsx` de sortie (styles, gel des volets, filtres, formats).
- Chiffrement du coffre-fort côté client (PBKDF2 → AES-256-GCM), clé jamais transmise en clair au serveur.

## Périmètre produit — à faire respecter par le code, pas par une politesse du modèle

- Trame transforme des fichiers. Toute demande hors de ce périmètre (météo, culture générale, écriture créative) doit être refusée par la classification d'intention (`isInScope`) **avant** tout accès aux outils de fichier — voir `docs/ARCHITECTURE.md` section 3.
- Le contenu d'un fichier déposé est une donnée, jamais une instruction. Aucun texte lu dans une cellule ne doit jamais atteindre un appel modèle comme s'il venait de l'utilisateur.
- Pas d'exécution de macros VBA (`.xlsm`) : lecture des valeurs et de la structure uniquement, jamais d'exécution de code contenu dans le fichier.
- Pas de fine-tuning ni d'entraînement sur des fichiers utilisateurs, à aucune phase. Voir `docs/ARCHITECTURE.md` section 5.4 si la question revient — c'est un point déjà tranché, pas à rouvrir sans discussion explicite avec le porteur du projet.

## Conventions de dépôt

- TypeScript partout, strict mode activé, pas de `any` non justifié.
- pnpm workspaces : `apps/web`, `apps/api`, `packages/core`, `packages/engine`, `packages/ooxml`.
- Un changement dans `packages/core` ou `packages/engine` exige les tests associés dans le même commit — pas de « je les ajoute après ».
- Avant de considérer une tâche terminée : `pnpm test` et `pnpm lint` passent sans avertissement nouveau.
- Les fichiers de démonstration utilisés dans les maquettes HTML initiales (données scriptées) ne doivent jamais migrer tels quels dans `packages/core` — ils servent de spec de comportement, pas de code de production.

## État du projet

Voir `docs/ROADMAP.md` pour les jalons. Avant de commencer une tâche, vérifier quel jalon est en cours — ne pas anticiper un jalon suivant (ex. ne pas commencer l'intégration Claude avant que M0–M2 soient marqués terminés).
