# Golden set — M1 (ARCHITECTURE.md §10.1)

Dix cas construits à la main, pas des fichiers d'utilisateurs réels. Chaque
cas ci-dessous documente le résultat attendu **avant** exécution du code :
profil (colonnes, types, taux de manquants), ambiguïtés, doublons, et — pour
le message associé — le scope attendu (`isInScope`) et les questions
attendues (`proposeQuestions`).

Le fichier source de vérité pour ces mêmes attentes, au format machine, est
`cases.ts` ; le test `goldenSet.test.ts` (dans `packages/core` pour le profil
seul, et dans `packages/engine` pour profil + `RuleBasedEngine`) vérifie que
le résultat réel correspond exactement à ce qui suit.

Tous les messages ci-dessous référencent explicitement un fichier existant
("ce fichier", "mon fichier"...), donc tous resolvent en scope
`file_transformation` — la diversité de scope (`conversational`,
`out_of_scope`) est déjà couverte par les tests de contrat et les tests
dédiés de `RuleBasedEngine.isInScope`, ce n'est pas l'objet du golden set.

---

## Profils propres (3 cas)

### 1. `budget_clean` — suivi budgétaire

Aucune ambiguïté, aucun doublon.

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Poste | 0 | text | 0 % |
| Budget | 1 | number | 0 % |
| Réalisé | 2 | number | 0 % |

- Lignes : 5 — Ambiguïtés : aucune — Doublons : aucun
- Message : *"Peux-tu calculer le total par catégorie dans ce fichier de budget ?"*
- Scope attendu : `file_transformation` — Questions attendues : aucune

### 2. `ventes_clean` — export des ventes

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Vendeur | 0 | text | 0 % |
| Region | 1 | text | 0 % |
| MontantVente | 2 | number | 0 % |

- Lignes : 5 — Ambiguïtés : aucune — Doublons : aucun
- Message : *"Fais-moi un tableau croisé des ventes par région dans ce fichier."*
- Scope attendu : `file_transformation` — Questions attendues : aucune

### 3. `rh_clean` — effectif RH

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Employe | 0 | text | 0 % |
| Poste | 1 | text | 0 % |
| Salaire | 2 | number | 0 % |

- Lignes : 5 — Ambiguïtés : aucune — Doublons : aucun
- Message : *"Vérifie les doublons dans ce fichier RH."*
- Scope attendu : `file_transformation` — Questions attendues : aucune

---

## Ambiguïté de colonnes de dates (3 cas)

### 4. `taches_dates_3cols` — suivi de tâches, 3 colonnes candidates

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| CreatedAt | 0 | date | 0 % |
| UpdatedAt | 1 | date | 0 % |
| DueDateText | 2 | date | 0 % |
| Task | 3 | text | 0 % |

- Lignes : 3 — Doublons : aucun
- Ambiguïté attendue : `ambiguous-date-columns` sur `["CreatedAt", "UpdatedAt", "DueDateText"]`
  — message exact : *"3 colonnes ressemblent à des dates (CreatedAt, UpdatedAt, DueDateText) : leur rôle métier respectif n'est pas déterminable automatiquement."*
- Message utilisateur : *"Peux-tu m'aider à choisir la bonne colonne de date dans ce fichier de suivi des tâches ?"*
- Scope attendu : `file_transformation` — Questions attendues : `ambiguous-date-columns`

### 5. `rh_dates_2cols` — dossier RH, exactement 2 colonnes candidates

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Employe | 0 | text | 0 % |
| DateEmbauche | 1 | date | 0 % |
| DateDepart | 2 | date | 0 % |
| Salaire | 3 | number | 0 % |

- Lignes : 3 — Doublons : aucun
- Ambiguïté attendue : `ambiguous-date-columns` sur `["DateEmbauche", "DateDepart"]`
  — message exact : *"2 colonnes ressemblent à des dates (DateEmbauche, DateDepart) : leur rôle métier respectif n'est pas déterminable automatiquement."*
  (2 est le seuil minimal déclenchant l'ambiguïté)
- Message utilisateur : *"Quelle date dois-je utiliser dans mon fichier RH ?"*
- Scope attendu : `file_transformation` — Questions attendues : `ambiguous-date-columns`

### 6. `crm_dates_3cols` — export CRM, 3 colonnes candidates

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Client | 0 | text | 0 % |
| DateCreation | 1 | date | 0 % |
| DateModification | 2 | date | 0 % |
| DateRelance | 3 | date | 0 % |
| Montant | 4 | number | 0 % |

- Lignes : 3 — Doublons : aucun
- Ambiguïté attendue : `ambiguous-date-columns` sur `["DateCreation", "DateModification", "DateRelance"]`
  — message exact : *"3 colonnes ressemblent à des dates (DateCreation, DateModification, DateRelance) : leur rôle métier respectif n'est pas déterminable automatiquement."*
- Message utilisateur : *"Aide-moi à analyser les dates dans ce fichier CRM."*
- Scope attendu : `file_transformation` — Questions attendues : `ambiguous-date-columns`

---

## Doublons évidents (2 cas)

### 7. `depenses_duplicates_1group` — une ligne dupliquée

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Poste | 0 | text | 0 % |
| Budget | 1 | number | 0 % |
| Réalisé | 2 | number | 0 % |

- Lignes : 5 — Ambiguïtés : aucune
- Doublon attendu : 1 groupe — lignes de la feuille `[2, 3]` (la ligne "Marketing / 1000 / 980" apparaît deux fois), occurrences = 2
- Message : *"Peux-tu vérifier les doublons dans ce fichier de dépenses ?"*
- Scope attendu : `file_transformation` — Questions attendues : `duplicate-rows`

### 8. `export_crm_duplicates_2groups` — deux paires dupliquées

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Vendeur | 0 | text | 0 % |
| Region | 1 | text | 0 % |
| Montant | 2 | number | 0 % |

- Lignes : 6 — Ambiguïtés : aucune
- Doublons attendus : 2 groupes — lignes `[2, 4]` ("Alice / Nord / 5000") et `[5, 6]` ("Carla / Est / 4100"), occurrences = 2 chacun
- Message : *"Ce fichier d'export CRM contient-il des doublons ?"*
- Scope attendu : `file_transformation` — Questions attendues : `duplicate-rows`

---

## Valeurs manquantes significatives (2 cas)

### 9. `rh_missing_values` — la moitié des salaires manquants

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Employe | 0 | text | 0 % |
| Poste | 1 | text | 0 % |
| Salaire | 2 | number | 3 / 6 = 50 % |

- Lignes : 6 — Ambiguïtés : aucune — Doublons : aucun
- Message : *"Ce fichier RH est-il complet ?"*
- Scope attendu : `file_transformation` — Questions attendues : aucune
  (`RuleBasedEngine` ne pose actuellement pas de question sur les valeurs
  manquantes — seules les colonnes de dates ambiguës et les doublons en
  déclenchent une ; c'est un comportement documenté, pas un oubli du golden set)

### 10. `budget_missing_values` — la majorité des montants réalisés manquants

| Colonne | Position | Type | Manquants |
|---|---|---|---|
| Poste | 0 | text | 0 % |
| Budget | 1 | number | 0 % |
| Réalisé | 2 | number | 4 / 7 ≈ 57,1 % |

- Lignes : 7 — Ambiguïtés : aucune — Doublons : aucun
- Message : *"Mon fichier de budget a-t-il des valeurs manquantes ?"*
- Scope attendu : `file_transformation` — Questions attendues : aucune
