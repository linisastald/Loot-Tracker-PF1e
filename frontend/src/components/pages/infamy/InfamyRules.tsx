import React from 'react';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import { INFAMY_THRESHOLDS } from './infamyData';

/** Static rules text of the Infamy system (the Rules tab). */
const InfamyRules: React.FC = React.memo(() => (
    <>
        <Typography variant="h6" gutterBottom>Infamy System Rules</Typography>

        <Paper sx={{ p: 3 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
                Some pirates only do what they do for the promise of wealth, being little more than brigands of the waves.
                Others do it for the reputation, fearsomeness, and power that comes with numbering among the most notorious
                scallywags on the seas. That's where Infamy comes in.
            </Typography>

            <Typography variant="h6" gutterBottom>Infamy and Disrepute Scores</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
                A party has two related scores, Infamy and Disrepute. Infamy tracks how many points the crew has gained over
                its career—think of this as the sum of all the outlandish stories and rumors about the PCs being told throughout
                the Shackles. Infamy rarely, if ever, decreases, and reaching certain Infamy thresholds provides useful benefits.
            </Typography>

            <Typography variant="body1" sx={{ mb: 2 }}>
                Disrepute is a spendable resource—a group's actual ability to cash in on its reputation. This currency is used to
                purchase impositions, deeds others might not want to do for the group, but that they perform either to curry the
                group's favor or to avoid its disfavor.
            </Typography>

            <Typography variant="h6" gutterBottom>Winning Infamy and Disrepute</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
                To gain Infamy, the PCs must moor their ship at a port for 1 full day, and the PC determined by the
                group to be its main storyteller must spend this time on shore carousing and boasting of infamous deeds.
                This PC must make either a Bluff, Intimidate, or Perform check. The DC of this check is equal to 15 + twice
                the group's average party level (APL).
            </Typography>

            <Box sx={{ my: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="subtitle1" gutterBottom>Success Results:</Typography>
                <Typography variant="body2">• Success: +1 Infamy and Disrepute</Typography>
                <Typography variant="body2">• Success by 5 or more: +2 Infamy and Disrepute</Typography>
                <Typography variant="body2">• Success by 10 or more: +3 Infamy and Disrepute</Typography>
                <Typography variant="body2">• Failure: No change in Infamy or Disrepute</Typography>
            </Box>

            <Typography variant="h6" gutterBottom>Infamy Thresholds</Typography>
            <TableContainer>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Title & Infamy Required</TableCell>
                            <TableCell>Benefit</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {INFAMY_THRESHOLDS.map((threshold) => (
                            <TableRow key={threshold.key}>
                                <TableCell>
                                    <strong>{threshold.title}</strong><br />({threshold.min}+ Infamy)
                                </TableCell>
                                <TableCell>
                                    <ul>
                                        {threshold.benefits.map((benefit) => (
                                            <li key={benefit}>{benefit}</li>
                                        ))}
                                    </ul>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    </>
));

InfamyRules.displayName = 'InfamyRules';

export default InfamyRules;
