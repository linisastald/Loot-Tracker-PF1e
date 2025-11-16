/**
 * SessionTaskService - Handles session task generation and assignment
 * Extracted from sessionService.js for better separation of concerns
 */

const pool = require('../../config/db');
const logger = require('../../utils/logger');

class SessionTaskService {
    /**
     * Generate and assign tasks for a session
     * @param {Object} session - Session data
     * @returns {Promise<Object>} - Task assignments
     */
    async generateSessionTasks(session) {
        try {
            // Get confirmed attendees for task assignment
            const attendanceResult = await pool.query(`
                SELECT
                    u.id as user_id,
                    u.username,
                    c.name as character_name,
                    sa.response_type,
                    sa.late_arrival_time
                FROM session_attendance sa
                JOIN users u ON u.id = sa.user_id
                LEFT JOIN characters c ON c.id = u.active_character
                WHERE sa.session_id = $1 AND sa.response_type = 'yes'
                ORDER BY sa.response_timestamp
            `, [session.id]);

            const attendees = attendanceResult.rows;

            if (attendees.length === 0) {
                logger.info('No confirmed attendees for session tasks:', { sessionId: session.id });
                return;
            }

            // Get attendees who are not arriving late for pre-session tasks
            const onTimeAttendees = attendees.filter(a => !a.late_arrival_time);

            // Define task templates similar to the existing task system
            const preTasks = [
                'Get Dice Trays',
                'Put Initiative name tags on tracker',
                'Wipe TV',
                'Recap'
            ];

            if (attendees.length >= 6) {
                preTasks.push('Bring in extra chairs if needed');
            }

            const duringTasks = [
                'Calendar Master',
                'Loot Master',
                'Lore Master',
                'Rule & Battle Master',
                'Inspiration Master'
            ];

            const postTasks = [
                'Food, Drink, and Trash Clear Check',
                'TV(s) wiped and turned off',
                'Dice Trays and Books put away',
                'Clean Initiative tracker and put away name labels',
                'Chairs pushed in and extra chairs put back',
                'Windows shut and locked and Post Discord Reminders',
                'Ensure no duplicate snacks for next session'
            ];

            // Helper function to assign tasks to attendees
            const assignTasksToAttendees = (tasks, people) => {
                if (people.length === 0) return {};

                const shuffledTasks = [...tasks].sort(() => Math.random() - 0.5);
                const assignments = {};

                people.forEach(person => {
                    assignments[person.username] = [];
                });

                shuffledTasks.forEach((task, index) => {
                    const assignee = people[index % people.length];
                    assignments[assignee.username].push(task);
                });

                return assignments;
            };

            // Generate task assignments
            const allAttendees = [...attendees, { username: 'DM', character_name: 'DM' }];

            const preTaskAssignments = assignTasksToAttendees(preTasks, onTimeAttendees);
            const duringTaskAssignments = assignTasksToAttendees(duringTasks, attendees);
            const postTaskAssignments = assignTasksToAttendees(postTasks, allAttendees);

            // Store task assignments in database
            const taskAssignments = {
                session_id: session.id,
                pre_tasks: preTaskAssignments,
                during_tasks: duringTaskAssignments,
                post_tasks: postTaskAssignments,
                generated_at: new Date(),
                attendee_count: attendees.length
            };

            await pool.query(`
                INSERT INTO session_task_assignments (
                    session_id, task_assignments, generated_at, attendee_count
                ) VALUES ($1, $2, NOW(), $3)
                ON CONFLICT (session_id)
                DO UPDATE SET
                    task_assignments = EXCLUDED.task_assignments,
                    generated_at = NOW(),
                    attendee_count = EXCLUDED.attendee_count
            `, [session.id, JSON.stringify(taskAssignments), attendees.length]);

            // Send to Discord if configured
            try {
                // Lazy load to avoid circular dependency
                const sessionDiscordService = require('../discord/SessionDiscordService');
                await sessionDiscordService.sendTaskAssignmentsToDiscord(session, taskAssignments);
            } catch (discordError) {
                logger.error('Failed to send task assignments to Discord:', discordError);
                // Don't throw here - task generation succeeded even if Discord failed
            }

            logger.info('Session tasks generated and assigned:', {
                sessionId: session.id,
                attendeeCount: attendees.length,
                onTimeCount: onTimeAttendees.length
            });

            return taskAssignments;

        } catch (error) {
            logger.error('Failed to generate session tasks:', error);
            throw error;
        }
    }

    /**
     * Get task assignments for a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Task assignments
     */
    async getSessionTaskAssignments(sessionId) {
        try {
            const result = await pool.query(`
                SELECT task_assignments, generated_at, attendee_count
                FROM session_task_assignments
                WHERE session_id = $1
            `, [sessionId]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to get session task assignments:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new SessionTaskService();
