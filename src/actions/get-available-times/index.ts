"use server";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { appointmentsTable, doctorsTable } from "@/db/schema";
import { generateTimeSlots } from "@/helpers/time";
import { protectedActionClientWithClinic } from "@/lib/next-safe-action";

dayjs.extend(utc);

export const getAvailableTimes = protectedActionClientWithClinic
  .schema(
    z.object({
      doctorId: z.string(),
      date: z.string().date(), // YYYY-MM-DD,
    }),
  )
  .action(async ({ parsedInput }) => {
    const doctor = await db.query.doctorsTable.findFirst({
      where: eq(doctorsTable.id, parsedInput.doctorId),
    });
    if (!doctor) {
      throw new Error("Médico não encontrado");
    }
    const selectedDayOfWeek = dayjs(parsedInput.date).day();
    const doctorIsAvailable =
      selectedDayOfWeek >= doctor.availableFromWeekDay &&
      selectedDayOfWeek <= doctor.availableToWeekDay;
    if (!doctorIsAvailable) {
      return [];
    }
    const appointments = await db.query.appointmentsTable.findMany({
      where: eq(appointmentsTable.doctorId, parsedInput.doctorId),
    });
    const appointmentsOnSelectedDate = appointments
      .filter((appointment) => {
        return dayjs(appointment.date).isSame(parsedInput.date, "day");
      })
      .map((appointment) => dayjs(appointment.date).format("HH:mm:ss"));

    const doctorAvailableFrom = dayjs()
      .utc()
      .set("hour", Number(doctor.availableFromTime.split(":")[0]))
      .set("minute", Number(doctor.availableFromTime.split(":")[1]))
      .set("second", 0)
      .local();
    const doctorAvailableTo = dayjs()
      .utc()
      .set("hour", Number(doctor.availableToTime.split(":")[0]))
      .set("minute", Number(doctor.availableToTime.split(":")[1]))
      .set("second", 0)
      .local();

    return generateTimeSlots()
      .filter((timeSlot) => {
        const [hour, minute] = timeSlot.split(":");
        const slotTime = dayjs()
          .set("hour", parseInt(hour))
          .set("minute", parseInt(minute))
          .set("second", 0);

        return (
          slotTime.isAfter(doctorAvailableFrom) &&
          slotTime.isBefore(doctorAvailableTo) &&
          !appointmentsOnSelectedDate.includes(timeSlot)
        );
      })
      .map((timeSlot) => ({
        value: timeSlot,
        label: timeSlot.substring(0, 5),
        available: true,
      }));
  });
