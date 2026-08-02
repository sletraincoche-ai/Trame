# Trame — feuille de route de développement

Ce document découpe la construction en jalons concrets, exécutables un par un avec Claude Code. Chaque jalon a une définition de fin vérifiable — pas d'impression subjective de « ça a l'air bon ». Correspond aux phases 0–4 de `docs/ARCHITECTURE.md`.

Règle de séquencement : on ne commence pas un jalon avant que le précédent soit coché en entier. C'est ce qui permet de dire honnêtement, à la fin, que l'API a été « branchée sur un système qui marchait déjà » plutôt que « posée sur une fondation jamais testée ».

---

## M0 — Squelette du repo (aucune IA, tout le reste réel)

**Objectif** : un utilisateur dépose un vrai fichier Excel, obtient un vrai profil de colonnes, une question de clarification (encore décidée par des règles simples), et télécharge un vrai classeur recomposé.

- [x] Monorepo pnpm : `apps/web`, `apps/api`, `packages/core`, `packages/engine`, `packages/ooxml`
- [x] `packages/ooxml` : `buildPivotWorkbook` — générateur minimal mais réel (styles, gel, filtres) ; pas repris des maquettes (hors repo, inaccessibles), reconstruit et testé
- [x] `packages/core` : lecture réelle d'un `.xlsx` via `exceljs` → profil structuré (colonnes, types détectés, taux de valeurs manquantes, doublons potentiels)
- [x] `packages/engine` : interface `ClarificationEngine` + `RuleBasedEngine`
- [x] `apps/web` : parcours complet (dépôt → profil → question → classeur) branché sur les vraies fonctions ci-dessus
- [ ] Coffre-fort : chiffrement client repris tel quel depuis la maquette de sécurité — non commencé

**Définition de fin** : déposer trois fichiers Excel réels et différents produit trois profils différents et corrects (vérifiable manuellement), sans aucune donnée de démonstration codée en dur dans le chemin d'exécution.

---

## M1 — Moteur de calcul réel

**Objectif** : tableaux croisés, formules, contrôles qualité — sur les vraies données, sans IA.

- [x] `compute_pivot(rows, cols, measure, agg)` — agrégation réelle (somme, moyenne, nombre, min, max)
- [x] `generate_formula(intent, columns)` — génère une formule Excel réelle + explication
- [x] `quality_check(dataset, rules)` — les six contrôles déjà maquettés
- [x] Jeu de tests de contrat (`packages/engine/src/contract-tests/`)
- [x] Constitution des dix premiers fichiers du golden set (`docs/ARCHITECTURE.md` section 10.1)

**Définition de fin** : les tests de contrat passent sur `RuleBasedEngine` ; le golden set existe et a un résultat attendu documenté pour chaque cas, avant même de commencer à écrire `ClaudeEngine`.

---

## M2 — Portillon de périmètre (encore sans IA)

**Objectif** : le comportement de refus existe et est testable, avant de dépendre d'un modèle pour le décider.

- [x] `isInScope(message)` version règle simple
- [x] Réponse fixe de refus, cohérente avec le ton produit
- [x] Jeu de refus (`docs/ARCHITECTURE.md` section 10.2)
- [x] Séparation instruction/donnée : test dédié

**Définition de fin** : le jeu de refus passe à 100 % avec la version « règle simple ».

---

## M3 — Intégration réelle de l'API Claude

**Objectif** : remplacer `RuleBasedEngine` par `ClaudeEngine` sur les décisions de jugement, sans toucher au reste du système.

- [x] `ClaudeEngine` implémente la même interface `ClarificationEngine`, avec les six outils définis dans `docs/ARCHITECTURE.md` §5.2
- [x] System prompt écrit à partir de `docs/ARCHITECTURE.md` §5.3
- [ ] Sortie structurée (schéma JSON) pour le plan de classeur et les questions de clarification — questions couvertes (`propose_questions`, tool_choice forcé) ; le schéma du plan de classeur (`assemble_workbook`) existe et est testé unitairement mais n'est pas encore exercé en conditions réelles
- [x] Classification d'intention en deux passes
- [x] `ClaudeEngine` passe le jeu de contrat de M1 et le jeu de refus de M2 — 9/9 contrat, 12/12 jeu de refus, mesuré contre l'API réelle
- [ ] Vérification contractuelle de la configuration zero data retention côté API — volontairement non automatisée (accord contractuel séparé, pas un paramètre d'appel) ; à vérifier à la main avant toute mise en production
- [x] Bascule contrôlée par un indicateur de configuration (`ENGINE=rule|claude`)

**Définition de fin** : `ClaudeEngine` activé par défaut seulement après avoir égalé ou dépassé `RuleBasedEngine` sur les deux jeux de tests, mesuré et documenté.

---

## M4 — Suggestions et personnalisation

- [ ] Suggestions immédiates (fin de livrable)
- [ ] Suggestions personnalisées — recherche contextuelle sur l'historique du compte courant uniquement
- [ ] Vérification explicite de non-contradiction avec la promesse de confidentialité

**Non traité dans cette feuille de route** : traitement par lots, connecteurs externes. À ne considérer qu'une fois M0–M4 stabilisés en usage réel.
