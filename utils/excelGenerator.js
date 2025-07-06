const ExcelJS = require('exceljs');
const path = require('path');

class ExcelGenerator {
    async generateAttendanceReport(classData, attendanceData) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Report');

        // Set up columns
        worksheet.columns = [
            { header: 'Student ID', key: 'student_id', width: 15 },
            { header: 'Student Name', key: 'student_name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Joined At', key: 'joined_at', width: 20 },
            { header: 'Left At', key: 'left_at', width: 20 },
            { header: 'Duration (mins)', key: 'duration_minutes', width: 15 },
            { header: 'Status', key: 'status', width: 12 }
        ];

        // Add header row styling
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '2563eb' }
        };
        worksheet.getRow(1).font = { color: { argb: 'FFFFFF' }, bold: true };

        // Add class information
        worksheet.insertRow(1, ['Class Information']);
        worksheet.insertRow(2, ['Class Title:', classData.title]);
        worksheet.insertRow(3, ['Course:', classData.course_title]);
        worksheet.insertRow(4, ['Date:', classData.scheduled_date]);
        worksheet.insertRow(5, ['Duration:', `${classData.duration_minutes} minutes`]);
        worksheet.insertRow(6, []);
        worksheet.insertRow(7, ['Attendance Report']);
        worksheet.insertRow(8, []);

        // Style class information
        worksheet.getRow(1).font = { bold: true, size: 16 };
        worksheet.getRow(7).font = { bold: true, size: 14 };

        // Add attendance data
        attendanceData.forEach((record, index) => {
            worksheet.addRow({
                student_id: record.student_id,
                student_name: `${record.first_name} ${record.last_name}`,
                email: record.email,
                joined_at: record.joined_at ? new Date(record.joined_at).toLocaleString() : 'N/A',
                left_at: record.left_at ? new Date(record.left_at).toLocaleString() : 'Still in class',
                duration_minutes: record.duration_minutes || 0,
                status: record.status || 'Present'
            });
        });

        // Add borders to data rows
        const dataStartRow = 9;
        const dataEndRow = dataStartRow + attendanceData.length;
        
        for (let i = dataStartRow; i <= dataEndRow; i++) {
            worksheet.getRow(i).eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        }

        // Add summary
        const summaryRow = dataEndRow + 2;
        worksheet.addRow([]);
        worksheet.addRow(['Summary:']);
        worksheet.addRow(['Total Students:', attendanceData.length]);
        worksheet.addRow(['Present:', attendanceData.filter(r => r.status === 'present').length]);
        worksheet.addRow(['Absent:', attendanceData.filter(r => r.status === 'absent').length]);
        worksheet.addRow(['Late:', attendanceData.filter(r => r.status === 'late').length]);

        // Generate filename
        const filename = `attendance_${classData.id}_${Date.now()}.xlsx`;
        const filepath = path.join(process.cwd(), 'public', 'uploads', filename);

        // Save file
        await workbook.xlsx.writeFile(filepath);
        
        return {
            filename: filename,
            filepath: filepath,
            url: `/uploads/${filename}`
        };
    }

    async generateCourseReport(courseData, studentsData) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Course Report');

        // Set up columns
        worksheet.columns = [
            { header: 'Student ID', key: 'student_id', width: 15 },
            { header: 'Student Name', key: 'student_name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Enrollment Date', key: 'enrollment_date', width: 18 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Classes Attended', key: 'classes_attended', width: 16 },
            { header: 'Total Classes', key: 'total_classes', width: 14 },
            { header: 'Attendance %', key: 'attendance_percentage', width: 14 }
        ];

        // Add header row styling
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '2563eb' }
        };
        worksheet.getRow(1).font = { color: { argb: 'FFFFFF' }, bold: true };

        // Add course information
        worksheet.insertRow(1, ['Course Report']);
        worksheet.insertRow(2, ['Course Title:', courseData.title]);
        worksheet.insertRow(3, ['Course Code:', courseData.course_code]);
        worksheet.insertRow(4, ['Lecturer:', courseData.lecturer_name]);
        worksheet.insertRow(5, ['Total Students:', studentsData.length]);
        worksheet.insertRow(6, []);
        worksheet.insertRow(7, ['Student Enrollment Details']);
        worksheet.insertRow(8, []);

        // Add student data
        studentsData.forEach(student => {
            const attendancePercentage = student.total_classes > 0 
                ? ((student.classes_attended / student.total_classes) * 100).toFixed(1)
                : '0.0';

            worksheet.addRow({
                student_id: student.student_id,
                student_name: `${student.first_name} ${student.last_name}`,
                email: student.email,
                enrollment_date: new Date(student.enrollment_date).toLocaleDateString(),
                status: student.status,
                classes_attended: student.classes_attended || 0,
                total_classes: student.total_classes || 0,
                attendance_percentage: `${attendancePercentage}%`
            });
        });

        // Generate filename
        const filename = `course_${courseData.id}_report_${Date.now()}.xlsx`;
        const filepath = path.join(process.cwd(), 'public', 'uploads', filename);

        // Save file
        await workbook.xlsx.writeFile(filepath);
        
        return {
            filename: filename,
            filepath: filepath,
            url: `/uploads/${filename}`
        };
    }
}

module.exports = new ExcelGenerator();
