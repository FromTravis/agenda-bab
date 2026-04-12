# 🏄 Agenda BAB

**L'agenda événementiel de Bayonne · Anglet · Biarritz & Pays Basque**

Un calendrier web full-stack qui scrape automatiquement les événements de la région BAB depuis des sites publics. **Aucune clé API requise.**

---

## ✨ Fonctionnalités

- **Calendrier interactif** – vue mois et vue liste
- **Filtres par catégorie** – Sport, Culture, Musique, Festival, Nature
- **Scraper automatique** – extrait les événements de `guide-du-paysbasque.com`, `bayonne.fr`, `destination-biarritz.fr`
- **Actualisation quotidienne** – cron job à 6h00 (Europe/Paris), aucune intervention requise
- **Base SQLite locale** – zéro dépendance externe, persistence entre redémarrages
- **Fallback IA optionnel** – si vous avez une clé Anthropic, elle complète les résultats du scraper
- **Déploiement Docker** – une commande suffit

---

## 🏗️ Architecture

```
agenda-bab/
├── backend/
│   ├── server.js              # Express API + cron job
│   ├── scraper.js             # ⭐ Scraper web (pas de clé API)
│   ├── db.js                  # Couche SQLite
│   ├── fetcher.js             # AI fetcher (optionnel, si clé Anthropic dispo)
│   ├── scripts/
│   │   └── refreshEvents.js   # Script standalone
│   └── data/                  # Base SQLite (auto-créée)
├── frontend/public/
│   └── index.html             # SPA complète
├── Dockerfile
├── docker-compose.yml
└── README.md
```

### Sources scrapées

| Site | Contenu | Fréquence de MAJ |
|------|---------|-----------------|
| `guide-du-paysbasque.com` | 4000+ événements, toute la région | quotidienne |
| `bayonne.fr` | Agenda officiel de la ville | quotidienne |
| `destination-biarritz.fr` | Agenda touristique Biarritz | quotidienne |

### API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET`   | `/api/events` | Liste les événements à venir |
| `GET`   | `/api/events?cat=sport` | Filtre par catégorie |
| `GET`   | `/api/events?from=2026-04-01&to=2026-06-30` | Filtre par dates |
| `POST`  | `/api/refresh` | Déclenche un scraping immédiat |
| `GET`   | `/api/status` | Statut serveur |

---

## 🚀 Installation

### Prérequis
- **Node.js 18+** (ou Docker) — c'est tout, pas de clé API

### 1. Installer les dépendances

```bash
cd agenda-bab/backend
npm install
```

### 2. Premier scraping (peuple la base)

```bash
node scripts/refreshEvents.js
```

Durée : ~2 minutes (scrape 5 pages + enrichit les fiches détail).

Version rapide (pas d'enrichissement des fiches) :
```bash
node scripts/refreshEvents.js --no-enrich
```

### 3. Lancer le serveur

```bash
node server.js
```

Ouvrez **http://localhost:3001** — le calendrier s'affiche avec les événements scrapés.

---

## ⚙️ Options du script de refresh

```bash
node scripts/refreshEvents.js                  # 5 pages, avec enrichissement
node scripts/refreshEvents.js --no-enrich      # rapide, sans fiches détail
node scripts/refreshEvents.js --pages 10       # scrape plus de pages (~100 événements)
```

---

## 🐳 Déploiement Docker

```bash
# Lancer (pas besoin de .env)
docker-compose up -d

# Premier scraping
docker-compose exec agenda-bab node backend/scripts/refreshEvents.js
```

---

## ☁️ Déploiement VPS

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

cd /opt/agenda-bab/backend
npm install
node scripts/refreshEvents.js   # Premier peuplement

# PM2 pour la gestion du processus
sudo npm install -g pm2
pm2 start server.js --name agenda-bab
pm2 save && pm2 startup
```

---

## 🔑 Clé Anthropic (optionnel)

Sans clé API, le scraper seul fonctionne très bien. Si vous souhaitez activer le fallback IA (pour compléter les résultats si le scraper retourne peu d'événements) :

```bash
cp .env.example .env
# Éditer .env : ANTHROPIC_API_KEY=sk-ant-...
npm install   # installe aussi @anthropic-ai/sdk
```

---

## 🐛 Dépannage

| Problème | Solution |
|----------|----------|
| Aucun événement affiché | Lancer `node scripts/refreshEvents.js` |
| Port occupé | Changer `PORT=3002` dans l'environnement |
| Erreur SQLite | Vérifier que `backend/data/` existe et est accessible |
| Scraper retourne 0 | Le site source a peut-être changé sa structure HTML |

---

## 📝 Licence

MIT
