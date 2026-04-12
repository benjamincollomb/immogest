# 🏢 ConciergePro

Application web de gestion pour concierge d'immeubles — 100% navigateur, sans backend.

## Fonctionnalités

- **Tableau de bord** — Vue globale, indicateurs en temps réel, priorités du moment
- **Tâches** — Gestion complète (CRUD), statuts, priorités, filtres par immeuble
- **Commandes** — Suivi du matériel commandé avec fournisseur et dates
- **Places & Appartements** — Gestion des disponibilités (parking intérieur/extérieur + logements)

## Données

Toutes les données sont stockées localement dans votre navigateur via `localStorage`.  
Aucun serveur requis. Vos données restent sur votre appareil.

## Déploiement sur GitHub Pages

1. Créez un dépôt GitHub (ex : `mon-conciergepro`)
2. Uploadez les trois fichiers : `index.html`, `style.css`, `script.js`
3. Allez dans **Settings → Pages**
4. Source : `Deploy from a branch` → branche `main`, dossier `/ (root)`
5. Cliquez **Save** — votre site sera disponible en quelques minutes à l'adresse :  
   `https://votre-username.github.io/mon-conciergepro/`

## Structure du projet

```
concierge-app/
├── index.html   ← Structure HTML (navigation, onglets, modales)
├── style.css    ← Design complet (responsive, variables CSS)
├── script.js    ← Logique applicative (CRUD, localStorage, UI)
└── README.md
```

## Technologies

- HTML5 / CSS3 / JavaScript ES6+ (vanilla, sans framework)
- FontAwesome 6 (icônes)
- Google Fonts : DM Sans + DM Mono
- localStorage pour la persistance des données
