/* ============================================================
   IMMOGEST — firebase-config.js
   Configuration Firebase (SDK compat — chargé via CDN)
   NE PAS PARTAGER CE FICHIER PUBLIQUEMENT
   ============================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyBHoXJyMgPZisDVFzzen9v-eefbEYsoYww",
  authDomain:        "immogest-e11ff.firebaseapp.com",
  projectId:         "immogest-e11ff",
  storageBucket:     "immogest-e11ff.firebasestorage.app",
  messagingSenderId: "1011565681389",
  appId:             "1:1011565681389:web:62671c9dc68194d97a8ae4"
};

/* Note : Pas de "import" ici car on utilise le SDK Firebase compat
   chargé directement via les balises <script> dans index.html.
   C'est la méthode correcte pour GitHub Pages (sans bundler). */
