import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333/api";
const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Rua+doutor+Fernando+Costa%2C+523+parque+hipolito";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDuration(minutes) {
  if (!minutes) {
    return "0 min";
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${String(remainingMinutes).padStart(2, "0")}`;
  }

  return `${minutes} min`;
}

function getDefaultDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatICSDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildReminderFile(booking) {
  if (!booking?.start || !booking?.end) {
    return "";
  }

  const servicesLabel = Array.isArray(booking.services) ? booking.services.join(", ") : "";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lideranca Barbearia//Agendamento//PT-BR",
    "BEGIN:VEVENT",
    `UID:${booking.id}@liderancabarbearia`,
    `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
    `DTSTART:${formatICSDate(booking.start)}`,
    `DTEND:${formatICSDate(booking.end)}`,
    `SUMMARY:Lideranca Barbearia - ${booking.name || "Agendamento"}`,
    `DESCRIPTION:Servicos: ${servicesLabel}`,
    "LOCATION:Rua doutor Fernando Costa, 523 - Parque Hipolito",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lembrete do seu atendimento na Lideranca Barbearia",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function MobileProgress({ currentStep, steps, onChange }) {
  const progress = `${((currentStep + 1) / steps.length) * 100}%`;

  return (
    <div className="mobile-progress-shell">
      <div className="mobile-progress-bar">
        <span style={{ width: progress }} />
      </div>
      <div className="mobile-progress">
        {steps.map((step, index) => {
          const stateClass =
            index === currentStep ? "active" : index < currentStep ? "done" : "";

          return (
            <button
              className={`mobile-progress-step ${stateClass}`}
              key={step.id}
              onClick={() => onChange(index)}
              type="button"
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [services, setServices] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [date, setDate] = useState(getDefaultDate);
  const [slots, setSlots] = useState([]);
  const [appointmentDuration, setAppointmentDuration] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileStep, setMobileStep] = useState(0);
  const [isMobileFlow, setIsMobileFlow] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateViewport = (event) => setIsMobileFlow(event.matches);

    setIsMobileFlow(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      const [servicesResponse, galleryResponse] = await Promise.all([
        fetch(`${API_URL}/services`),
        fetch(`${API_URL}/gallery`),
      ]);

      setServices(await servicesResponse.json());
      setGallery(await galleryResponse.json());
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    async function loadSchedule() {
      const serviceQuery = selectedServices.join(",");
      const [availabilityResponse, bookingsResponse] = await Promise.all([
        fetch(`${API_URL}/availability?date=${date}&services=${serviceQuery}`),
        fetch(`${API_URL}/bookings?date=${date}`),
      ]);

      const availabilityData = await availabilityResponse.json();
      const bookingsData = await bookingsResponse.json();

      setSlots(availabilityData.slots ?? []);
      setAppointmentDuration(availabilityData.appointmentDuration ?? 0);
      setBookings(bookingsData);
      setSelectedTime("");
    }

    loadSchedule();
  }, [date, selectedServices]);

  const cartItems = services.filter((service) => selectedServices.includes(service.id));
  const cart = {
    items: cartItems,
    totalPrice: cartItems.reduce((sum, item) => sum + item.price, 0),
    totalDuration: cartItems.reduce((sum, item) => sum + item.duration, 0),
  };

  const mobileSteps = [
    { id: "services", label: "Servicos" },
    { id: "slots", label: "Horario" },
    { id: "client", label: "Seus dados" },
    { id: "confirm", label: "Confirmacao" },
  ];

  const reminderFileUrl = useMemo(() => buildReminderFile(confirmedBooking), [confirmedBooking]);
  const currentMobileStep = mobileSteps[mobileStep];

  function toggleService(serviceId) {
    setStatusMessage("");
    setConfirmedBooking(null);
    setSelectedServices((current) =>
      current.includes(serviceId)
        ? current.filter((item) => item !== serviceId)
        : [...current, serviceId],
    );
  }

  function updateForm(event) {
    setStatusMessage("");
    setConfirmedBooking(null);
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function refreshAgenda() {
    const [availabilityResponse, bookingsResponse] = await Promise.all([
      fetch(`${API_URL}/availability?date=${date}&services=${selectedServices.join(",")}`),
      fetch(`${API_URL}/bookings?date=${date}`),
    ]);

    const availabilityData = await availabilityResponse.json();
    const bookingsData = await bookingsResponse.json();

    setSlots(availabilityData.slots ?? []);
    setAppointmentDuration(availabilityData.appointmentDuration ?? 0);
    setBookings(bookingsData);
  }

  async function handleBooking(event) {
    event.preventDefault();

    if (!selectedServices.length || !selectedTime) {
      setStatusMessage("Escolha pelo menos um servico e um horario.");
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      const response = await fetch(`${API_URL}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          date,
          time: selectedTime,
          serviceIds: selectedServices,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel agendar.");
      }

      setStatusMessage(data.message);
      setConfirmedBooking({
        ...data.booking,
        date,
        time: selectedTime,
        name: form.name,
        phone: form.phone,
      });
      setForm({ name: "", phone: "" });
      setSelectedServices([]);
      setSelectedTime("");
      await refreshAgenda();

      if (isMobileFlow) {
        setMobileStep(3);
      }
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function goToNextStep() {
    if (mobileStep === 0 && !selectedServices.length) {
      setStatusMessage("Selecione pelo menos um servico para continuar.");
      return;
    }

    if (mobileStep === 1 && !selectedTime) {
      setStatusMessage("Escolha um horario livre para continuar.");
      return;
    }

    if (mobileStep === 2 && (!form.name || !form.phone)) {
      setStatusMessage("Preencha nome e WhatsApp para continuar.");
      return;
    }

    setStatusMessage("");
    setMobileStep((current) => Math.min(current + 1, 3));
  }

  function goToPreviousStep() {
    setStatusMessage("");
    setMobileStep((current) => Math.max(current - 1, 0));
  }

  function renderServiceSelection() {
    return (
      <>
        <div className="section-heading">
          <p className="eyebrow">Escolha seus servicos</p>
          <h2>Monte o atendimento antes de escolher o horario.</h2>
        </div>
        <p className="hero-card-text">
          Defina tudo o que sera feito durante o atendimento para descobrir o valor e o tempo total do servico.
        </p>
        <div className="hero-service-list">
          {services.map((service) => {
            const active = selectedServices.includes(service.id);

            return (
              <button
                className={`service-card ${active ? "active" : ""}`}
                key={service.id}
                onClick={() => toggleService(service.id)}
                type="button"
              >
                <div>
                  <strong>{service.name}</strong>
                </div>
                <div className="service-meta">
                  <span>{service.duration} min</span>
                  <span>{formatCurrency(service.price)}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="hero-cart-box">
          <strong>{cart.items.length ? `${cart.items.length} servico(s) selecionado(s)` : "Nenhum servico selecionado"}</strong>
          <span>{formatDuration(appointmentDuration)} no total</span>
          <span>{formatCurrency(cart.totalPrice || 0)}</span>
        </div>
        {!cart.items.length ? (
          <p className="hero-cart-empty">Selecione corte, barba, bigode ou combo para continuar.</p>
        ) : null}
      </>
    );
  }

  function renderScheduleSelection() {
    return (
      <>
        <div className="section-heading">
          <p className="eyebrow">Agenda aberta</p>
          <h2>Escolha a data e veja os horarios livres</h2>
        </div>

        <div className="agenda-toolbar">
          <div className="agenda-date-card">
            <strong>Troque a data para consultar outros dias da agenda.</strong>
            <span>Toque no calendario e escolha o dia que voce deseja agendar.</span>
            <label>
              Data do atendimento
              <input
                className="agenda-date-input"
                min={getDefaultDate()}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <div className="agenda-summary">
            <span>{slots.filter((slot) => slot.available).length} horarios livres</span>
            <span>{bookings.length} reservas visiveis</span>
          </div>
        </div>

        <div className="agenda-helper">
          <strong>Tempo previsto do atendimento: {formatDuration(appointmentDuration || 0)}</strong>
          <span>
            Os horarios mostrados abaixo ja consideram o tempo total dos servicos escolhidos e
            bloqueiam o proximo cliente durante esse periodo.
          </span>
        </div>

        <div className={`agenda-layout ${isMobileFlow ? "mobile-agenda-layout" : ""}`}>
          <div>
            <h3>Horarios disponiveis</h3>
            <div className="slots-grid">
              {slots.map((slot) => (
                <button
                  className={`slot ${selectedTime === slot.time ? "selected" : ""}`}
                  disabled={!slot.available}
                  key={slot.time}
                  onClick={() => {
                    setStatusMessage("");
                    setConfirmedBooking(null);
                    setSelectedTime(slot.time);
                  }}
                  type="button"
                >
                  {slot.time}
                </button>
              ))}
            </div>
          </div>

          {!isMobileFlow ? (
            <div>
              <h3>Horarios ja ocupados</h3>
              <div className="booking-list">
                {bookings.length ? (
                  bookings.map((booking) => (
                    <article className="booking-item" key={booking.id}>
                      <strong>{booking.time}</strong>
                      <span>Horario indisponivel</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-text">Nenhuma reserva para essa data.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {isMobileFlow ? (
          <div className="mobile-agenda-tip">
            <strong>So mostramos os horarios livres no celular.</strong>
            <span>Os horarios ocupados ja saem da lista para deixar a escolha mais rapida.</span>
          </div>
        ) : null}
      </>
    );
  }

  function renderBookingForm(showSubmitButton = true) {
    return (
      <>
        <div className="section-heading">
          <p className="eyebrow">Fechar horario</p>
          <h2>Confirmar atendimento</h2>
        </div>

        <form className="booking-form" onSubmit={handleBooking}>
          <input name="name" onChange={updateForm} placeholder="Nome completo" required value={form.name} />
          <input name="phone" onChange={updateForm} placeholder="WhatsApp" required value={form.phone} />

          <div className="checkout-card">
            <p>Agendamento selecionado</p>
            <strong>{selectedTime ? `${formatDisplayDate(date)} as ${selectedTime}` : "Escolha um horario na agenda"}</strong>
            <span>{cart.items.length ? cart.items.map((item) => item.name).join(", ") : "Sem servicos"}</span>
            <span>
              Total: {formatCurrency(cart.totalPrice || 0)} | {formatDuration(appointmentDuration)}
            </span>
          </div>

          {showSubmitButton ? (
            <button className="submit-button" disabled={loading} type="submit">
              {loading ? "Confirmando..." : "Agendar agora"}
            </button>
          ) : null}

          {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
        </form>
      </>
    );
  }

  function renderConfirmationStep() {
    return (
      <>
        <div className="section-heading">
          <p className="eyebrow">Agendamento concluido</p>
          <h2>Confirme os detalhes e salve no celular</h2>
        </div>

        {confirmedBooking ? (
          <div className="confirmation-card">
            <strong>{confirmedBooking.name}, seu horario esta reservado.</strong>
            <span>Data: {formatDisplayDate(confirmedBooking.date)}</span>
            <span>Horario: {confirmedBooking.time}</span>
            <span>Servicos: {Array.isArray(confirmedBooking.services) ? confirmedBooking.services.join(", ") : ""}</span>
            <span>Tempo previsto: {formatDuration(confirmedBooking.totalDuration)}</span>
            <div className="confirmation-actions">
              <a className="submit-button confirmation-link" href={MAPS_URL} rel="noreferrer" target="_blank">
                Como chegar
              </a>
              {reminderFileUrl ? (
                <a
                  className="secondary-button"
                  download={`agendamento-${confirmedBooking.id}.ics`}
                  href={reminderFileUrl}
                >
                  Ativar lembrete no celular
                </a>
              ) : null}
            </div>
            <p className="confirmation-note">
              O botao de lembrete adiciona o horario ao calendario do celular com aviso 30 minutos antes. O cliente pode aceitar ou nao.
            </p>
          </div>
        ) : (
          <div className="confirmation-card">
            <strong>Finalize o formulario para concluir seu agendamento.</strong>
            <span>Depois da confirmacao, esta tela mostra data, horario e o botao de lembrete.</span>
          </div>
        )}

        {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
      </>
    );
  }

  const desktopLayout = (
    <>
      <header className="hero">
        <div className="hero-main">
          <div className="hero-copy">
            <div className="inline-brand">
              <span className="inline-brand-mark">LDR</span>
              <span className="inline-brand-text">Lideranca Barbearia</span>
            </div>
            <p className="eyebrow">Lideranca Barbearia</p>
            <h1>Visual alinhado, agenda aberta e atendimento sem enrolacao.</h1>
            <p className="hero-text">
              Rua doutor Fernando Costa, 523 - Parque Hipolito
            </p>
            <p className="hero-subtext">Terca a sabado, das 9h as 19h</p>
            <div className="hero-location-card">
              <strong>Atendimento com horario marcado</strong>
              <span>Rua doutor Fernando Costa, 523 - Parque Hipolito</span>
              <span>Terca a sabado, das 9h as 19h</span>
              <a className="maps-link" href={MAPS_URL} rel="noreferrer" target="_blank">
                Como chegar
              </a>
            </div>
          </div>

          <div className="hero-portfolio-panel">
            <div className="section-heading">
              <p className="eyebrow">Portifolio</p>
              <h2>Trabalhos em destaque</h2>
            </div>
            <div className="hero-portfolio">
              {gallery.slice(0, 4).map((item) => (
                <article className="hero-portfolio-card" key={item.id}>
                  <img src={item.image} alt={item.title} />
                </article>
              ))}
            </div>
          </div>
        </div>

        <aside className="hero-card">
          <p className="hero-card-kicker">Escolha seus servicos</p>
          <h2 className="hero-card-title">Monte o atendimento antes de escolher o horario.</h2>
          <p className="hero-card-text">
            Defina tudo o que sera feito durante o atendimento para descobrir o valor e o tempo total do servico.
          </p>
          <div className="hero-service-list">
            {services.map((service) => {
              const active = selectedServices.includes(service.id);

              return (
                <button
                  className={`service-card ${active ? "active" : ""}`}
                  key={service.id}
                  onClick={() => toggleService(service.id)}
                  type="button"
                >
                  <div>
                    <strong>{service.name}</strong>
                  </div>
                  <div className="service-meta">
                    <span>{service.duration} min</span>
                    <span>{formatCurrency(service.price)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hero-cart-box">
            <strong>{cart.items.length ? `${cart.items.length} servico(s) selecionado(s)` : "Nenhum servico selecionado"}</strong>
            <span>{formatDuration(appointmentDuration)} no total</span>
            <span>{formatCurrency(cart.totalPrice || 0)}</span>
          </div>
          {!cart.items.length ? (
            <p className="hero-cart-empty">Selecione corte, barba, bigode ou combo para continuar.</p>
          ) : null}
          <a href="#agenda">Ir para agendamento</a>
        </aside>
      </header>

      <main className="content-grid">
        <section className="panel agenda-panel" id="agenda">
          {renderScheduleSelection()}
        </section>

        <section className="panel booking-panel">
          {renderBookingForm(true)}
        </section>

        {confirmedBooking ? (
          <section className="panel confirmation-panel">
            {renderConfirmationStep()}
          </section>
        ) : null}
      </main>
    </>
  );

  const mobileLayout = (
    <main className="mobile-flow">
      <section className="mobile-topbar">
        <div className="mobile-topbar-brand">
          <span className="inline-brand-mark">LDR</span>
          <span className="inline-brand-text">Lideranca Barbearia</span>
        </div>
        <div className="mobile-topbar-copy">
          <p className="eyebrow">Etapa {mobileStep + 1}</p>
          <strong>{currentMobileStep.label}</strong>
        </div>
      </section>

      <section className="mobile-hero panel">
        <div className="inline-brand">
          <span className="inline-brand-mark">LDR</span>
          <span className="inline-brand-text">Lideranca Barbearia</span>
        </div>
        <p className="eyebrow">Rua doutor Fernando Costa, 523 - Parque Hipolito</p>
        <h1>Agende em poucos toques.</h1>
        <p className="hero-subtext">Terca a sabado, das 9h as 19h</p>
      </section>

      <MobileProgress currentStep={mobileStep} onChange={setMobileStep} steps={mobileSteps} />

      <section className="mobile-summary-card">
        <strong>{selectedTime ? `${formatDisplayDate(date)} as ${selectedTime}` : "Escolha os servicos e o horario"}</strong>
        <span>{cart.items.length ? cart.items.map((item) => item.name).join(", ") : "Nenhum servico selecionado"}</span>
        <span>{formatCurrency(cart.totalPrice || 0)} | {formatDuration(appointmentDuration)}</span>
      </section>

      <section className="panel mobile-step-panel">
        {mobileStep === 0 ? renderServiceSelection() : null}
        {mobileStep === 1 ? renderScheduleSelection() : null}
        {mobileStep === 2 ? renderBookingForm(false) : null}
        {mobileStep === 3 ? renderConfirmationStep() : null}

        <div className="mobile-step-actions">
          {mobileStep > 0 && mobileStep < 3 ? (
            <button className="secondary-button" onClick={goToPreviousStep} type="button">
              Voltar
            </button>
          ) : null}

          {mobileStep < 2 ? (
            <button className="submit-button" onClick={goToNextStep} type="button">
              Continuar
            </button>
          ) : null}

          {mobileStep === 2 ? (
            <button className="submit-button" disabled={loading} onClick={handleBooking} type="button">
              {loading ? "Confirmando..." : "Confirmar agendamento"}
            </button>
          ) : null}

          {mobileStep === 3 && confirmedBooking ? (
            <button
              className="secondary-button"
              onClick={() => {
                setConfirmedBooking(null);
                setStatusMessage("");
                setMobileStep(0);
              }}
              type="button"
            >
              Fazer novo agendamento
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );

  return <div className="page-shell">{isMobileFlow ? mobileLayout : desktopLayout}</div>;
}
