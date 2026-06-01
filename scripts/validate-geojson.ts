#!/usr/bin/env npx tsx
import fs from 'fs';
import path from 'path';
import { validateCampusGeoJSON } from '../src/data/validate-geojson';

const filePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), 'src/data/campus-wgs84.geojson');

const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
validateCampusGeoJSON(parsed);
console.log('campus-wgs84.geojson validation passed');
