import { SKILLS, SKILL_POINTS, type Skill } from '../../shared/constants.ts'

export const SKILL_LABELS: Record<Skill, string> = {
  beginner: 'Beginner (first time touching grass)',
  intermediate: 'Intermediate (I somewhat know how to control and pass)',
  'semi-pro': 'Semi-pro (I know ball)',
  professional: 'Professional (Ball knows me)',
}

export const SKILL_LEVELS = SKILLS.map((value) => ({
  value,
  label: SKILL_LABELS[value],
  points: SKILL_POINTS[value],
}))

export const BALANCE_EXAMPLES = [
  {
    title: 'One of each level',
    detail:
      'If both teams have one Professional, one Semi-pro, one Intermediate, and one Beginner, both teams total 10 points.',
  },
  {
    title: 'Two strong players on one side',
    detail:
      'If Team 1 has two Professionals and Team 2 has mostly Beginners, move one Professional across before the match starts.',
  },
  {
    title: 'All Professionals together',
    detail:
      'Four Professionals against four Beginners is unbalanced, so Professionals should be split across both teams.',
  },
  {
    title: 'Semi-pro overload',
    detail:
      'If one team has three Semi-pro players, swap one Semi-pro with an Intermediate from the other team.',
  },
  {
    title: 'Registration order',
    detail:
      'If the first four signups are all strong players, the table should still be rearranged instead of locking them together.',
  },
  {
    title: 'Sixteen-player table',
    detail:
      'With four players at every level, each team should receive a similar mix instead of one team getting all the top levels.',
  },
  {
    title: 'Wrong skill selected',
    detail:
      'If someone signs up as Intermediate but clearly plays like a Professional, staff can update the level and rebalance.',
  },
  {
    title: 'Small score gap',
    detail:
      'If one team totals 11 points and the other totals 9, swapping a Professional with a Semi-pro can make it 10 and 10.',
  },
  {
    title: 'Late Professional signup',
    detail:
      'A late Professional should not simply be added to the smaller team; the full table can be recalculated.',
  },
  {
    title: 'Uneven player count',
    detail:
      'With an odd number of players, one team may have one extra player, but the skill score should still stay close.',
  },
]
