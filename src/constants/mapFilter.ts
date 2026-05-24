export const ACCESS_POINT_NAME_EXCLUSIONS = ['복도', '계단', '외부', '운동장', '주차장', '방풍실', 'X'] as const;

export const isEligibleAccessPointName = (name: string): boolean => {
  const normalizedName = name.trim();

  if (!normalizedName) {
    return false;
  }

  return !ACCESS_POINT_NAME_EXCLUSIONS.some((fragment) => normalizedName.includes(fragment));
};
