#!/usr/bin/env python3
"""Génère le logo de l'application : une maison avec trois traits de chaleur ondulés, en blanc sur
une tuile orange (le motif des traits de chaleur de la liste des pièces).

Sorties (à relancer après toute modification de la géométrie) :
  resources/logo/logo.svg            maître vectoriel
  resources/logo/icon-512.png        grande illustration
  resources/logo/icon-144.png        icône de grande taille du catalogue
  resources/logo/icon-48.png         icône de petite taille du catalogue
  resources/images/menu_icon.png     icône du menu de la montre (25 x 25, dessinée au pixel)

Usage : python3 resources/logo/make_logo.py
"""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ORANGE = (255, 85, 0, 255)      # GColorOrange (#FF5500), dans la palette de 64 couleurs
WHITE = (255, 255, 255, 255)

# Géométrie dans un carré de 144 unités.
TILE = 144
RADIUS = 30
HOUSE = [(72, 24), (124, 68), (124, 122), (20, 122), (20, 68)]
HOUSE_STROKE = 9
WAVE_X = [50, 72, 94]
WAVE_TOP, WAVE_BOTTOM = 72, 112
WAVE_AMPLITUDE = 5.5
WAVE_PERIOD = 20.0
WAVE_STROKE = 6.5


def wave_points(x, steps=48):
    pts = []
    for i in range(steps + 1):
        y = WAVE_TOP + (WAVE_BOTTOM - WAVE_TOP) * i / steps
        pts.append((x + WAVE_AMPLITUDE * math.sin(2 * math.pi * (y - WAVE_TOP) / WAVE_PERIOD), y))
    return pts


def write_svg(path):
    waves = ''.join(
        '  <polyline points="%s" fill="none" stroke="#fff" stroke-width="%s" stroke-linecap="round" '
        'stroke-linejoin="round"/>\n' % (' '.join('%.1f,%.1f' % p for p in wave_points(x)), WAVE_STROKE)
        for x in WAVE_X)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">\n'
        '  <title>Tado pour Pebble</title>\n'
        '  <rect width="%d" height="%d" rx="%d" fill="#ff5500"/>\n'
        '  <polygon points="%s" fill="none" stroke="#fff" stroke-width="%s" stroke-linejoin="round"/>\n'
        '%s</svg>\n') % (TILE, TILE, TILE, TILE, TILE, TILE, RADIUS,
                         ' '.join('%d,%d' % p for p in HOUSE), HOUSE_STROKE, waves)
    with open(path, 'w') as f:
        f.write(svg)


def round_line(draw, pts, width, scale):
    """Polyligne à bouts et jointures arrondis."""
    xy = [(x * scale, y * scale) for x, y in pts]
    draw.line(xy, fill=WHITE, width=int(width * scale), joint='curve')
    r = width * scale / 2
    for x, y in xy:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)


def render(size):
    """Rendu lissé : dessiné à 8 fois la taille puis réduit."""
    ss = 8
    scale = size * ss / TILE
    img = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=RADIUS * scale, fill=ORANGE)
    round_line(d, HOUSE + [HOUSE[0], HOUSE[1]], HOUSE_STROKE, scale)
    for x in WAVE_X:
        round_line(d, wave_points(x), WAVE_STROKE, scale)
    return img.resize((size, size), Image.LANCZOS)


def menu_icon():
    """25 x 25, dessinée au pixel : pas de dégradés, seulement deux couleurs de la palette.
    Le toit est à 45 degrés pour que ses marches soient régulières ; la paroi fait deux pixels."""
    img = Image.new('RGBA', (25, 25), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, 24, 24], radius=5, fill=ORANGE)
    # Maison : un polygone blanc dont on retire l'intérieur.
    d.polygon([(12, 3), (22, 13), (22, 22), (2, 22), (2, 13)], fill=WHITE)
    d.polygon([(12, 6), (20, 14), (20, 20), (4, 20), (4, 14)], fill=ORANGE)
    # Trois traits de chaleur ondulés dans la maison, un pixel d'amplitude.
    offsets = [0, 1, 1, 0, -1, -1]
    for x in (8, 12, 16):
        for i, dx in enumerate(offsets):
            d.point((x + dx, 14 + i), fill=WHITE)
    return img


def main():
    write_svg(os.path.join(ROOT, 'resources', 'logo', 'logo.svg'))
    for size in (512, 144, 48):
        render(size).save(os.path.join(ROOT, 'resources', 'logo', 'icon-%d.png' % size))
    menu_icon().save(os.path.join(ROOT, 'resources', 'images', 'menu_icon.png'))


if __name__ == '__main__':
    main()
