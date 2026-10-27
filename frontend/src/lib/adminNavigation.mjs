export function currentAdminDestination(groups, pathname) {
  return groups.flatMap(group => group.single ? [group] : group.children)
    .filter(item => pathname === item.to || (!item.end && pathname.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0] || null;
}
