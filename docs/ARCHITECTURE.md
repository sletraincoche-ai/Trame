# Trame — de la maquette au produit

*Document d'architecture · v0.1 · Juillet 2026*

Architecture technique de référence : ce que fait réellement le système, où s'intègre l'API Claude, et comment on passe d'une démonstration convaincante à un outil qui tient sur de vraies données.

**Statut** : base de travail · **Portée** : cadrage avant intégration API · **Prochaine étape** : prototype avec Claude API

---

## Sommaire

Onze sections. Les trois qui comptent le plus si vous ne lisez qu'un tiers du document : la position produit (2), la couche Claude (5) et le point sur l'entraînement (5.4).

1. Pourquoi ce document
2. Position du produit
3. Ce que Trame fait — et ce qu'il refuse
4. Architecture globale
5. La couche Claude
6. Moteur de traitement des fichiers
7. Parcours conversationnel de bout en bout
8. Moteur de suggestions
9. Sécurité et confidentialité
10. Qualité, tests et évaluation
11. Feuille de route

---

## 01 — Pourquoi ce document

Les maquettes construites jusqu'ici (interface, coffre-fort, constructeur de classeur, mode conversationnel) simulent le comportement final. Ce document décrit le système qui rendrait ce comportement réel, avant d'y brancher une clé API.

Trois maquettes fonctionnelles ont validé l'expérience cible : le parcours en questions de clarification, la composition de classeur par blocs, l'export Excel réel. Ce qui reste simulé : la lecture du fichier déposé, la génération des questions, le calcul des tableaux croisés et la rédaction des formules — tout cela est aujourd'hui scripté avec des données de démonstration.

Ce document sert de référence commune avant l'intégration d'une clé API Claude : il fixe le périmètre, les responsabilités de chaque composant, et surtout la manière dont on rend le système fiable — qui n'est pas la manière imaginée initialement. La section 5.4 revient en détail sur ce point, parce que c'est le seul endroit du document où le cadrage initial a dû être corrigé.

> **Ce que ce document n'est pas.** Ce n'est pas un cahier des charges figé ni un contrat d'ingénierie. C'est la carte qu'on garde ouverte pendant qu'on construit le premier prototype connecté à l'API, pour ne pas réinventer les arbitrages à chaque itération.

---

## 02 — Position du produit

Trame transforme un fichier professionnel en livrable structuré, en posant les questions qu'un analyste poserait avant d'agir — jamais en devinant à sa place.

### Le problème traité

Une personne qui manipule occasionnellement Excel — le profil visé n'est pas l'analyste financier chevronné, c'est quelqu'un comme Alexandra : compétente, peu disponible pour apprendre un outil de plus, qui a besoin d'un résultat présentable et juste, pas d'un tableau de bord impressionnant. Le risque du marché n'est pas le manque d'outils IA-Excel, c'est qu'ils devinent en silence : ils choisissent une colonne de date au hasard, fusionnent des doublons sans le dire, et livrent un fichier faux avec assurance.

### Le différenciateur

Trame s'arrête sur l'ambiguïté réelle et la nomme. Pas une case à cocher générique — la question précise que poserait un collègue qui a ouvert le fichier : « trois colonnes de dates, laquelle fait référence, et voici ce que change chaque choix ». C'est un comportement, pas une fonctionnalité, et c'est ce que l'architecture doit protéger en priorité : mieux vaut un système plus lent qui pose la bonne question qu'un système rapide qui décide à la place de l'utilisateur.

### Le second différenciateur : la confidentialité comme architecture, pas comme mention

« Vos données ne servent jamais à l'entraînement » n'est crédible que si c'est vérifiable dans la conception : chiffrement de bout en bout dont le produit ne détient pas la clé, choix explicite de région d'hébergement, et — point central pour la couche Claude — configuration de l'API en **zero data retention** côté fournisseur de modèle. La section 9 détaille comment cet engagement se traduit techniquement plutôt que déclarativement.

| Dimension | Ce que Trame est | Ce que Trame n'est pas |
|---|---|---|
| Utilisateur cible | Occasionnel, compétent, pressé | Data analyst, développeur VBA |
| Promesse | Un fichier juste, expliqué, téléchargeable | Un assistant conversationnel généraliste |
| Comportement clé | Demande avant d'agir sur l'ambigu | Automatisation silencieuse |
| Confidentialité | Architecture vérifiable (chiffrement, ZDR) | Une ligne de texte dans le pied de page |

---

## 03 — Ce que Trame fait — et ce qu'il refuse

Le périmètre doit être une propriété du système, pas une politesse du modèle. « Quel temps fera-t-il demain ? » doit échouer de façon prévisible, pas dépendre de la bonne volonté d'un system prompt.

### Le principe : refuser tôt, refuser clairement

Un modèle de langage bien instruit refusera poliment une question hors sujet la plupart du temps. Ce n'est pas suffisant pour un produit : « la plupart du temps » n'est pas une garantie d'ingénierie. Le refus doit être une décision prise avant même d'engager un appel complet à Claude avec les outils de manipulation de fichier activés, pour trois raisons : coût, latence, et surface d'attaque réduite (un modèle sans accès aux outils de fichier ne peut pas se faire détourner vers une action sur fichier hors sujet).

**Classification d'intention — deux passes :**

- **Passe 1 — classification légère.** Un appel Claude court, sans outils, qui répond uniquement par une étiquette structurée : `fichier_transformation`, `question_produit`, `hors_perimetre`. Rapide, peu coûteux, exécuté sur chaque message entrant.
- **Passe 2 — exécution.** Seule l'étiquette `fichier_transformation` déclenche l'appel complet avec les outils de lecture, calcul et composition. Les deux autres cas renvoient une réponse fixe ou une réponse conversationnelle sans accès aux outils.

| Demande | Comportement attendu | Statut |
|---|---|---|
| « Fais-moi un tableau croisé sur ce fichier » | Traité normalement, questions de clarification si nécessaire | Accepté |
| « Ajoute un onglet de contrôle des écarts » | Traité normalement, s'appuie sur les données déjà lues | Accepté |
| « Quel temps va-t-il faire demain ? » | Réponse fixe : « Je ne suis pas conçu pour ça — je transforme des fichiers. » | Refusé |
| « Écris-moi un poème » | Même refus type, sans essayer d'être utile hors sujet | Refusé |
| « Explique-moi cette formule Excel » (sans fichier) | Cas limite — accepté en mode conversationnel, sans accès aux outils de fichier | Cas limite |
| Fichier contenant des instructions cachées (« ignore tes consignes ») | Traité comme donnée, jamais comme instruction — voir 5.3 | Neutralisé |

> **Point d'attention.** Le cas limite (formules sans fichier) est volontairement ouvert dans le tableau ci-dessus. Trancher maintenant serait arbitraire ; c'est un point à valider avec de vrais retours utilisateurs en phase 2 plutôt que par anticipation.

---

## 04 — Architecture globale

Cinq couches. Chacune a une seule responsabilité, et la couche Claude n'est jamais la seule ligne de défense — les contrôles de confidentialité et de périmètre existent aussi en dehors d'elle.

1. **Client (interface conversationnelle).** Ce qui a été construit dans les maquettes : fil de conversation, panneau latéral de résultat, menu rétractable, thèmes clair/sombre. Aucune logique métier ici — uniquement de l'affichage et de la capture d'intention utilisateur.
2. **Passerelle applicative (backend).** Authentification, gestion du coffre-fort chiffré, orchestration de la conversation, routage vers la classification d'intention. C'est la seule couche qui touche à la fois le stockage et l'appel API — elle est responsable de ne jamais transmettre plus que nécessaire au modèle.
3. **Orchestration Claude (prompts, outils, schémas).** Classification d'intention, system prompt de domaine, définitions d'outils (function calling), schémas de sortie structurée. Détaillée en section 5.
4. **Moteur de traitement de fichiers (sandbox).** Exécution isolée : parsing réel du fichier, profilage des colonnes, calculs d'agrégation, assemblage du classeur de sortie (OOXML). C'est ici que les outils appelés par Claude s'exécutent réellement — jamais dans le contexte du modèle lui-même. Détaillée en section 6.
5. **Stockage chiffré (coffre-fort).** Fichiers sources, classeurs produits, journal d'accès — chiffrés avec une clé dérivée côté client (PBKDF2 → AES-256-GCM). Le serveur ne détient jamais la clé en clair.

**Ce qui ne change pas par rapport aux maquettes.** Le modèle de chiffrement du coffre-fort, le comportement du parcours en quatre étapes (lecture, clarification, composition, classeur), et le principe des blocs assemblables restent valides tels quels. L'architecture ci-dessus les fait fonctionner avec de vraies données au lieu de données scriptées — elle ne les remplace pas.

---

## 05 — La couche Claude

C'est la section la plus longue du document parce que c'est celle qui détermine si Trame tient une vraie utilisation ou seulement une démonstration.

### 5.1 — Choix de modèle

Deux usages distincts, deux modèles distincts. La classification d'intention (section 3) est un appel court et fréquent : un modèle rapide et économique suffit. La composition du classeur — comprendre une demande ambiguë, choisir les bonnes questions, écrire des formules justes — bénéficie d'un modèle plus capable, appelé moins souvent. Ne pas figer un nom de modèle dans ce document : les modèles disponibles évoluent plus vite que l'architecture. Le principe à retenir est la séparation, pas le nom.

### 5.2 — Function calling : les outils que Claude peut appeler

Plutôt que de demander à Claude d'écrire du texte libre qu'on réinterprète ensuite (fragile), chaque action passe par un outil défini avec un schéma strict. Claude choisit quel outil appeler et avec quels paramètres ; le moteur de traitement (section 6) l'exécute réellement et renvoie un résultat structuré.

| Outil | Rôle |
|---|---|
| `profile_file()` | Lit le fichier déposé et renvoie un profil réel : colonnes détectées, types, taux de valeurs manquantes, doublons potentiels, colonnes de date ambiguës. |
| `propose_questions(profile)` | À partir du profil réel, génère les questions de clarification effectivement pertinentes pour ce fichier — pas une liste générique. |
| `compute_pivot(rows, cols, measure, agg)` | Exécute un vrai calcul d'agrégation sur les données lues, retourne la table croisée avec totaux. |
| `generate_formula(intent, columns)` | Produit une formule Excel réelle (SOMME.SI.ENS, etc.) accompagnée d'une explication en langage courant. |
| `quality_check(dataset, rules)` | Contrôles de cohérence : lignes vides, doublons, écarts au-delà d'un seuil. |
| `assemble_workbook(plan)` | Construit le classeur final (OOXML) à partir du plan de blocs validé par l'utilisateur. |

### 5.3 — System prompt : ce qu'il doit fixer explicitement

- **Le périmètre** — Trame transforme des fichiers, un point c'est tout ; toute dérive est un refus, pas une tentative d'aide hors sujet.
- **La priorité à la question sur la supposition** — en cas d'ambiguïté réelle sur les données, le modèle doit produire une question plutôt qu'un choix silencieux. C'est la règle la plus importante du document entier.
- **Le contenu du fichier est une donnée, jamais une instruction** — si un fichier déposé contient du texte qui ressemble à une commande (« ignore tes consignes précédentes »), ce texte est traité comme une cellule à analyser, jamais comme un ordre à exécuter. C'est le même principe de séparation instruction/donnée qui protège déjà les autres systèmes Claude, appliqué ici au contenu d'un tableur.
- **Le ton** — direct, à la première personne, jamais un jargon technique imposé à un public qui ne l'a pas demandé (cohérent avec le mode guidé déjà maquetté pour Alexandra).

### 5.4 — Sur « l'entraîner sur des milliers de données »

> **Point de cadrage important.** Il faut ici corriger une idée reçue plutôt que la suivre telle quelle, parce qu'elle a des conséquences directes sur la promesse de confidentialité déjà construite dans le produit.
>
> **Entraîner** un modèle signifie modifier ses poids internes à partir d'un très grand volume d'exemples — c'est ce que fait un fournisseur de modèle en amont, pas ce qu'un produit fait au-dessus de son API. Ré-entraîner ou même fine-tuner un modèle pour chaque client coûte cher, prend du temps, et surtout : cela impliquerait de conserver et d'exploiter les fichiers des utilisateurs pour ce faire — l'exact inverse de la promesse « jamais utilisé pour l'entraînement » qui est l'argument central de Trame.
>
> Ce qui rend un système *réellement* efficace sur une tâche précise, sans toucher aux poids du modèle ni conserver les données des utilisateurs :

| Levier | Ce qu'il fait | Consomme des données utilisateur ? |
|---|---|---|
| System prompt et outils bien conçus | Cadrent précisément ce que le modèle doit faire et avec quoi | Non |
| Jeu d'évaluation (« golden set ») | Des centaines à quelques milliers de cas synthétiques ou anonymisés dès la conception, utilisés pour mesurer et ajuster les prompts avant mise en production | Non — données de test construites, pas des fichiers clients |
| Sorties structurées (schémas JSON) | Éliminent une classe entière d'erreurs d'interprétation, sans aucun apprentissage requis | Non |
| Recherche contextuelle (RAG) sur l'historique d'un compte | Personnalise les suggestions (section 8) en relisant les conversations passées du même compte au moment de répondre | Oui, mais éphémère et scopé au compte — jamais partagé ni utilisé pour modifier le modèle |
| Fine-tuning dédié | Envisageable en phase tardive si un besoin précis et mesuré l'exige | Oui — à traiter à part, avec un consentement explicite, hors du périmètre de ce document |

En complément, l'API Claude d'Anthropic n'utilise pas par défaut les données envoyées via l'API pour entraîner ses modèles, et propose une option de rétention zéro pour les acteurs qui la demandent. Cet engagement du fournisseur est ce qui rend la promesse de Trame tenable techniquement — encore faut-il la configurer explicitement plutôt que la supposer, et le vérifier contractuellement au moment de l'intégration.

---

## 06 — Moteur de traitement des fichiers

C'est le morceau qui manque le plus dans les maquettes : tout, dans les maquettes, part de données scriptées. Cette section décrit ce qui les remplace.

### 6.1 — Lecture réelle

Selon le type de fichier déposé : lecture directe de la structure OOXML pour `.xlsx`/`.xlsm`, extraction tabulaire pour `.csv`, extraction de texte et de tableaux pour `.pdf`. Le résultat est un profil de données structuré — colonnes, types, échantillon, anomalies détectées — qui sert d'entrée à Claude, jamais le fichier brut entier si sa taille dépasse ce qui est raisonnable à transmettre.

### 6.2 — Exécution isolée

Chaque calcul déclenché par un outil (agrégation, contrôle qualité, assemblage du classeur) s'exécute dans un environnement isolé, sans accès réseau sortant, à durée de vie limitée à la requête. Le modèle ne « calcule » jamais lui-même une agrégation sur des milliers de lignes — il choisit l'outil et ses paramètres, l'environnement isolé fait le calcul, le résultat structuré revient au modèle pour la suite de la conversation. Cette séparation évite deux problèmes distincts : les erreurs d'arithmétique d'un modèle de langage, et l'exposition du contenu du fichier à un contexte plus large que nécessaire.

### 6.3 — Assemblage du classeur

Le générateur OOXML déjà construit et testé dans les maquettes (styles, gel des volets, filtres automatiques, barres de données) reste valable tel quel : c'est une brique indépendante de la couche Claude, qui prend en entrée un plan de blocs validé et produit un fichier `.xlsx` réel. Rien à refaire ici, seulement à brancher sur des données réelles plutôt que sur le jeu de données de démonstration.

> **Limite de taille à documenter tôt.** Un fichier de plusieurs centaines de milliers de lignes ne doit pas être profilé ligne par ligne devant l'utilisateur en temps réel. Une limite raisonnable (à valider en phase 2, probablement de l'ordre de la centaine de milliers de lignes pour l'aperçu interactif) doit être fixée et communiquée clairement plutôt que découverte par un échec silencieux.

---

## 07 — Parcours conversationnel de bout en bout

Le même parcours en quatre étapes déjà validé dans les maquettes, avec à chaque étape ce qui devient réel.

1. **Dépôt et classification.** Le fichier est déposé et chiffré côté client. La demande textuelle passe par la classification d'intention (section 3) avant tout accès aux outils de fichier.
2. **Profilage réel.** L'outil `profile_file()` s'exécute dans l'environnement isolé et renvoie la structure effective du fichier — plus de « 1 284 lignes » codé en dur, un vrai compte de lignes.
3. **Clarification générée, pas scriptée.** Claude, à partir du profil réel, produit les questions effectivement pertinentes pour ce fichier précis via `propose_questions()`. Le nombre de questions n'est plus fixé à deux par convention — c'est le nombre de points réellement ambigus.
4. **Composition et calcul.** Le plan de blocs est construit avec le même constructeur par glisser-déposer déjà maquetté ; chaque bloc s'appuie désormais sur `compute_pivot()`, `generate_formula()` ou `quality_check()` exécutés sur les vraies données.
5. **Assemblage et livraison.** `assemble_workbook()` produit le fichier réel, présenté dans le panneau latéral déjà construit, avec un vrai bouton de téléchargement.

---

## 08 — Moteur de suggestions

L'objectif exprimé : que Trame propose lui-même la suite, plutôt que d'attendre toujours une nouvelle demande explicite. Ce moteur reste un ajout par-dessus la conversation, pas une modification du modèle.

### 8.1 — Deux échelles de suggestion

- **Immédiate** — à la fin d'un livrable, Claude propose 2 à 3 suites plausibles à partir du résultat qui vient d'être produit (déjà maquetté : « Ajouter le détail par entité », « Mettre en avant les dépassements »). Ce niveau ne nécessite aucun historique, seulement le contexte de la conversation en cours.
- **Personnalisée** — à l'ouverture d'une session, Trame peut relire (dans la limite du compte de l'utilisateur, jamais entre comptes) les motifs récurrents de ses demandes passées pour suggérer une action avant même qu'elle ne soit demandée. C'est de la recherche contextuelle (RAG) sur l'historique du compte au moment de répondre, pas un apprentissage qui modifierait le modèle pour d'autres utilisateurs.

### 8.2 — Garde-fou

Une suggestion reste une proposition cliquable, jamais une action exécutée d'elle-même. C'est cohérent avec le principe central de la section 2 : Trame demande avant d'agir, y compris quand l'idée vient de lui.

---

## 09 — Sécurité et confidentialité

La maquette de sécurité déjà construite (dérivation de clé PBKDF2, chiffrement AES-256-GCM, coffre-fort à clé non détenue par le serveur) reste le modèle de référence.

| Engagement produit | Mécanisme technique |
|---|---|
| « Vos fichiers restent privés » | Chiffrement de bout en bout, clé dérivée côté client, jamais transmise au serveur en clair |
| « Jamais utilisé pour l'entraînement » | Configuration explicite de l'API en zéro rétention de données côté fournisseur de modèle, vérifiée contractuellement, pas supposée |
| « Traité dans la région choisie » | Sélection de région d'hébergement pour le stockage et pour le point d'accès API utilisé, cohérents entre eux |
| « Un contenu de fichier ne peut pas détourner le système » | Séparation stricte instruction/donnée dans le system prompt (section 5.3), aucun contenu de fichier n'est jamais interprété comme une commande |

> **À vérifier avant tout engagement public.** Les clauses de traitement des données de l'offre API retenue doivent être lues et confirmées avant toute communication marketing sur ce sujet — la promesse de confidentialité de Trame ne peut pas dépendre d'une supposition sur les conditions d'un fournisseur tiers.

---

## 10 — Qualité, tests et évaluation

« Ultra efficace sur les tâches demandées » se construit par la mesure répétée, pas par un volume de données d'entraînement.

### 10.1 — Le jeu d'évaluation (golden set)

Un ensemble de cas de test construits délibérément, pas collectés au hasard : des fichiers représentatifs (budgets, exports CRM, relevés bancaires) avec leurs ambiguïtés connues à l'avance, et le résultat attendu pour chacun. Ce jeu sert à mesurer chaque changement de prompt ou d'outil avant sa mise en production.

### 10.2 — Le jeu de refus

Symétriquement : une liste de demandes hors périmètre (météo, culture générale, écriture créative, demandes d'action dangereuse) qui doivent systématiquement produire un refus propre. C'est ce jeu qui garantit que « quel temps va-t-il faire demain » échoue de façon fiable, pas seulement probable.

### 10.3 — Suivi en production

- Taux de questions de clarification jugées pertinentes par les utilisateurs (retour explicite, pas déduit).
- Taux de classeurs téléchargés sans modification ultérieure demandée — un signal indirect de justesse.
- Taux de refus sur demandes hors périmètre, comparé au jeu de refus de référence.

---

## 11 — Feuille de route

Quatre phases. Chacune produit quelque chose d'utilisable, aucune ne dépend d'un pari sur la phase suivante. Le détail opérationnel jour-par-jour vit dans `ROADMAP.md` (jalons M0 à M4) ; cette section donne la vue produit de plus haut niveau.

- **Phase 0 — faite.** Maquette d'expérience : interface conversationnelle, coffre-fort chiffré simulé, constructeur de classeur par blocs, export `.xlsx` réel. Données de démonstration scriptées.
- **Phase 1 — premier prototype connecté.** Lecture réelle + classification de périmètre.
- **Phase 2 — outils complets.** Clarification et calculs réellement générés, golden set constitué.
- **Phase 3 — personnalisation.** Suggestions et mémoire de compte.
- **Phase 4 — échelle.** Connecteurs et volume — à ne considérer qu'une fois les phases 1 à 3 stabilisées en usage réel.
