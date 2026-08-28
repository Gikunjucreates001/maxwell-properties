export const PROPERTY_TYPE_OPTIONS = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'deferred_residence', label: 'Deferred Residence' },
];

export function getPropertyTypeLabel(type) {
  if (type === 'rental') return 'Apartment';
  return PROPERTY_TYPE_OPTIONS.find((option) => option.value === type)?.label || type || 'Property';
}

export function isApartmentProperty(typeOrProperty) {
  const type = typeof typeOrProperty === 'string' ? typeOrProperty : typeOrProperty?.type;
  return type === 'apartment' || type === 'rental';
}
