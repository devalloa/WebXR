# Avatar des sims — source et licence

`sim.glb` est dérivé du personnage **Casual_Male** de l'*Ultimate Animated Character Pack*
(novembre 2019, version glTF d'octobre 2021) de **Quaternius** :
https://quaternius.com/packs/ultimatedanimatedcharacter.html

Licence : **CC0 1.0 Universal** (domaine public, aucune attribution requise) —
https://creativecommons.org/publicdomain/zero/1.0/ (fichier `License.txt` du pack).

Modifications apportées (Blender 4.2, script de conversion déterministe) :

- seuls les clips `Idle` et `Walk` sont conservés, renommés `idle` et `walk` ;
  la marche est accélérée (facteur de durée 0,878) pour avancer à environ 1,2 m/s ;
- échelle appliquée pour une hauteur de 1,7 m, origine aux pieds, face avant +Z glTF ;
- matériaux réduits à trois : `Skin` (ton chair, la peau source étant noire), `Outfit` (haut)
  et `Details` (couleurs par sommet : cheveux, yeux assombris, pantalon, ceinture) ;
- maillage simplifié de 6 492 à 5 600 triangles ; objet parasite `Icosphere` supprimé.
