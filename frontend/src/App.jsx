import { useEffect, useState } from "react";

const API_URL = "http://localhost:3333/api";
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
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

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

  function toggleService(serviceId) {
    setSelectedServices((current) =>
      current.includes(serviceId)
        ? current.filter((item) => item !== serviceId)
        : [...current, serviceId],
    );
  }

  function updateForm(event) {
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
      setForm({ name: "", email: "", phone: "" });
      setSelectedServices([]);
      setSelectedTime("");
      await refreshAgenda();
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell">
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

          <div className="agenda-layout">
            <div>
              <h3>Horarios disponiveis</h3>
              <div className="slots-grid">
                {slots.map((slot) => (
                  <button
                    className={`slot ${selectedTime === slot.time ? "selected" : ""}`}
                    disabled={!slot.available}
                    key={slot.time}
                    onClick={() => setSelectedTime(slot.time)}
                    type="button"
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>

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
          </div>
        </section>

        <section className="panel booking-panel">
          <div className="section-heading">
            <p className="eyebrow">Fechar horario</p>
            <h2>Confirmar atendimento</h2>
          </div>

          <form className="booking-form" onSubmit={handleBooking}>
            <input name="name" onChange={updateForm} placeholder="Nome completo" required value={form.name} />
            <input name="email" onChange={updateForm} placeholder="Email" required type="email" value={form.email} />
            <input name="phone" onChange={updateForm} placeholder="WhatsApp" required value={form.phone} />

            <div className="checkout-card">
              <p>Agendamento selecionado</p>
              <strong>{selectedTime ? `${date} as ${selectedTime}` : "Escolha um horario na agenda"}</strong>
              <span>{cart.items.length ? cart.items.map((item) => item.name).join(", ") : "Sem servicos"}</span>
              <span>
                Total: {formatCurrency(cart.totalPrice || 0)} | {formatDuration(appointmentDuration)}
              </span>
            </div>

            <button className="submit-button" disabled={loading} type="submit">
              {loading ? "Confirmando..." : "Agendar agora"}
            </button>

            {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}
