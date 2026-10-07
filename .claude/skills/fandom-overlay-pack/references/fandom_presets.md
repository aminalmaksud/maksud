# Fandom presets

Starting points for the design. Each preset gives the look to use (a built-in look, or a suggestion for a custom one)
plus palette, motifs and fallback fonts. The user's answers (series split, fonts, or a request
to switch the look after seeing the sample) always win. Fonts listed here are the fallback
for any role the user didn't specify. For a topic that is not listed,
build a preset the same way: pick the look (a built-in look, or a custom one from references/look_plugins.md), 4-6 colours from the world's own materials,
1-2 motifs that belong to it, and font candidates whose letterforms echo its era or medium.

Every font named here is on Google Fonts, so `scripts/get_font.sh` can fetch it.
Do not use official logos or studio trademarks; letterforms that evoke a world are fine.

## Contents
- Default series codes and colour rules
- Comic: DC, Marvel, any superhero or cartoon topic
- Greek mythology
- Norse mythology
- The Lord of the Rings, Middle-earth, The Silmarillion
- Harry Potter
- Dune
- The Witcher
- Star Wars, space opera, sci-fi
- A Song of Ice and Fire, Game of Thrones
- Mahabharata, Ramayana, South Asian epics
- Font checks (read before proposing fonts)

## Default series codes and colour rules
- The user's convention is a short code plus the post number: HP1, LOTR1, DCV1, DCH1.
  One series per fandom is the default (HP, LOTR, DUNE, WIT, SW, GRK). Offer a split only when
  the topic has natural camps (heroes/villains, gods/heroes/monsters, houses).
- Each series gets an accent colour. Accents of the same fandom should be clearly different
  from each other and from the metal/highlight colour. Villain/dark camps lean red,
  hero/light camps lean blue, a third camp gets a green, violet or teal.
- `ink` stays near-black and `paper` a warm cream unless the world calls for something else
  (a cold sci-fi world can use a cool off-white).

## Comic: DC, Marvel, superheroes, cartoons
- Look: `comic`. Motif: `zigzag` (add `stars` for cosmic topics).
- Colours: ink #0D0A08, paper #F4EBD9, hi (comic yellow) #F5C842, metal #C9A961.
- Series ideas: Villains (DCV / MV, red #D9412B), Heroes (DCH / MH, blue #3B7DD8),
  Anti-heroes (purple #7D4FC9), Teams (green #3E9B5C).
- Fonts: display Bangers, numbers Luckiest Guy, handle Bangers (all caps, so set
  `handleCase: "upper"`). Alternatives: Bowlby One SC, Bungee, Permanent Marker (handle).
- Sample: en1 "DC VILLAINS", en2 "THE JOKER".

## Greek mythology
- Look: `epic`. Motifs: `meander` (Greek key), `leaves` (laurel).
- Colours: ink #0E0B09, paper #F3E9D2, metal #D4AF37, hi #E8C766, muted #B3A281.
- Series ideas: one series GRK, or Gods GG (Aegean blue #3E7CB1), Heroes GH (terracotta
  #B5452E), Monsters GM (olive #4F7A3A).
- Fonts: display Cinzel Decorative or Marcellus SC; numbers Playfair Display 900;
  handle Cormorant Garamond 700.
- Sample: en1 "GREEK GODS", en2 "ZEUS".

## Norse mythology
- Look: `epic`. Motifs: `runes`, `waves`.
- Colours: ink #0B0D10, paper #E9E4D8, metal #A9B4BE (iron-silver), hi #D8C27A, muted #8C96A0.
- Series ideas: NORSE, or Gods (#5A7FA8), Giants (#8E3B2E), Realms (#4C7A5A).
- Fonts: display Pirata One or Metamorphous; numbers Grenze 800; handle Grenze 600.

## The Lord of the Rings, Middle-earth, The Silmarillion
- Look: `manuscript` (Tolkien's world is maps, books and letters). Motifs: `leaves` (Elvish vine), `runes` (Dwarvish), `dots`.
- Manuscript colours: ink #2A1A0E, paper and parchment #E8D5A9, parchmentEdge #A07F4A, metal #C8A85A.
- Colours: ink #0D0C08, paper #EFE6CF, metal #C8A85A, hi #E3C977, muted #A8996F.
- Series ideas: LOTR (single), or Free Peoples (green #4F7A3A), Shadow (red-black #8E2F23),
  Ainur/Elves (silver-blue #6F8FB0).
- Fonts: display Uncial Antiqua, Cinzel or IM Fell English SC; numbers Cormorant Garamond 700
  (check the 1); handle IM Fell English.
- Sample: en1 "MIDDLE-EARTH", en2 "GANDALF".

## Harry Potter
- Look: `manuscript` (Marauder's-map parchment, letters, wax seals). Motifs: `lightning`, `stars`.
- Colours: ink #0E0B0A, paper #F1E7D0, metal #C9A961, hi #E8C766, muted #A89878.
- Series ideas: HP (single), or by house: Gryffindor (#9C2A23), Slytherin (#2F6B45),
  Ravenclaw (#2F4F8F), Hufflepuff (#C9A23A, swap metal to bronze #B08D57 so it stands apart).
- Fonts: display Cinzel Decorative or Henny Penny (playful); numbers Playfair Display 900;
  handle IM Fell English or Cormorant Garamond 700.
- Sample: en1 "HOGWARTS", en2 "SEVERUS SNAPE".

## Dune
- Look: `scifi` with a desert palette: amber glow #E3A04A on near-black #0E0A06, Fremen-blue accent. Motifs: `waves` (dunes), `hud`.
- Colours: ink #120D08, paper #F2E3C6, metal #D19A4B (spice gold), hi #E9B872, muted #B39773.
- Series ideas: DUNE (single), or Houses: Atreides (#3C6E5C), Harkonnen (#5B5B60),
  Fremen (#3E6FA3, "blue within blue").
- Fonts: display Michroma or Syncopate (wide, monumental); numbers Exo 2 800; handle Exo 2 600.
- Sample: en1 "HOUSE ATREIDES", en2 "PAUL ATREIDES".

## The Witcher
- Look: `manuscript` with a colder parchment (#DCD3C0, edge #7E705A) and dark-red seals. Motifs: `runes`, `dots`.
- Colours: ink #0B0B0C, paper #E6E1D6, metal #B9B9B4 (silver), hi #C9A961, muted #8F8A80.
- Series ideas: WIT (single), or Monsters (#7A2E2A), Characters (#4E6E8E), Signs/Magic (#6B4E8E).
- Fonts: display Pirata One or Grenze Gotisch; numbers Grenze 800; handle Grenze 600.
- Sample: en1 "THE WITCHER", en2 "GERALT OF RIVIA".

## Star Wars, space opera, sci-fi
- Look: `scifi` (cockpit and console style, glow #F2C230). Motifs: `stars`, `hud`.
- Colours: ink #07080B, paper #EDEFF2, metal #F2C230 (title yellow), hi #F2C230, muted #8E96A3.
- Series ideas: SW (single), or Jedi (blue #3B82D6), Sith (red #D13A2E), Rebels (orange #E07B2E),
  Empire (grey #7C838C).
- Fonts: display Orbitron 900 or Audiowide; numbers Orbitron 900; handle Exo 2 600.
- Sample: en1 "THE SITH", en2 "DARTH VADER".

## A Song of Ice and Fire, Game of Thrones
- Look: `epic`. Motifs: `runes` (First Men), `dots`.
- Colours: ink #0C0B0A, paper #ECE5D6, metal #B8A27A, hi #D9C38A, muted #9A8F7C.
- Series ideas: ASOIAF (single), or Houses: Stark (#7A8C99), Lannister (#B0322B),
  Targaryen (#7A1E1E with black), Night's Watch (#3B3B3B).
- Fonts: display Cinzel or Marcellus SC; numbers Cormorant Garamond 700; handle Cormorant Garamond 700.

## Fandoms that want a custom look (see look_plugins.md)
- **Egyptian mythology:** lapis #1F4E9C, gold #D4AF37 and papyrus #E9DCB5. Cartouche tags, hieroglyph bands. Fonts: Cinzel Decorative, Marcellus.
- **Japanese mythology or samurai:** sumi ink #141414, washi paper #F1EADB, vermilion #C8372D. Red hanko seal tags, brush-stroke panels, wave crests. Fonts: Shippori Mincho, Yuji Syuku.
- **Batman or noir crime:** black, bone #E8E2D4, one blood-red accent. Venetian-blind light bars, case-file stamps. Fonts: Special Elite, Oswald.
- **Lovecraft or cosmic horror:** grime greens, occult circles, torn pages. Fonts: IM Fell English, Pirata One.

## Mahabharata, Ramayana, South Asian epics
- Look: `epic` with warm temple colours. Motifs: `leaves` (lotus vine), `dots`.
- Colours: ink #140A06, paper #F6E7C8, metal #D9A441, hi #F0C35C, muted #B9946A.
- Series ideas: MBH (single), or Pandavas (#2F5F9E), Kauravas (#9E2F2F), Gods (#C76B1E).
- Fonts: display Cinzel Decorative or Rozha One; numbers Playfair Display 900; handle Cormorant Garamond 700.

## Font checks (read before proposing fonts)
Two problems came up in the original build and are easy to repeat:
1. **Numbers that look like letters.** Cinzel, Cinzel Decorative and similar Roman-capital
   fonts draw "1" like a capital "I", so DCV1 reads "DCVI". Keep those for words and give
   the numbers their own font (Playfair Display 900, Luckiest Guy, Orbitron, Exo 2, Grenze).
   The engine forces lining numerals, so Playfair's old-style figures are not an issue.
2. **All-caps fonts and the handle.** Cinzel, Bangers and many display faces have no
   lowercase, which turns "@MusingsofMaksud" into an unreadable run. Either give the
   handle a font with lowercase (Cormorant Garamond, IM Fell English, Exo 2) and keep
   `handleCase: "asis"`, or set `handleCase: "upper"`; the engine then colour-splits the
   words (MUSINGS / OF / MAKSUD) so they stay readable.
